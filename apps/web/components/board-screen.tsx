"use client";

import type {
  Board,
  Card,
  CreatorType,
  SessionUser,
  Stage,
} from "@cutline/shared";
import {
  ApiError,
  CREATOR_TYPES,
  LIMITS,
  QUERY_KEYS,
  TEMPLATES,
  TIMING,
} from "@cutline/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CREATOR_OPTIONS } from "../constants";
import { BoardCanvas } from "./board-canvas";
import { availableTags, filterCards } from "./board-model";
import { Icon } from "./brand";
import { CardDetail } from "./card-detail";
import { StageEditor } from "./stage-editor";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { ErrorNotice, useClients } from "./workspace";
import { WorkspaceNav } from "./workspace-nav";

type Undo = {
  cardId: string;
  from: string;
  to: string;
  label: string;
  expires: number;
};
type Move = { card: Card; stageId: string } | { undo: Undo };

export function BoardScreen({
  user,
  onSignedOut,
}: {
  user: SessionUser;
  onSignedOut: () => unknown;
}) {
  const { api, auth } = useClients();
  const client = useQueryClient();
  const boardQuery = useQuery({
    queryKey: QUERY_KEYS.board,
    queryFn: api.getBoard,
  });
  const [archive, setArchive] = useState(false);
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const [overview, setOverview] = useState(false);
  const [capture, setCapture] = useState("");
  const [selected, setSelected] = useState<Card | null>(null);
  const [stageEditor, setStageEditor] = useState<Stage | "new" | null>(null);
  const [undo, setUndo] = useState<Undo | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const operationLock = useRef(false);
  const captureRef = useRef<HTMLInputElement>(null);
  useUnsavedChanges(Boolean(capture));
  const refresh = () => {
    void client.invalidateQueries({ queryKey: QUERY_KEYS.board });
  };
  const board = boardQuery.data;
  const stages = [...(board?.stages ?? [])].sort(
    (a, b) => a.position - b.position,
  );

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(
      () => setUndo(null),
      Math.max(0, undo.expires - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [undo]);

  async function acceptCard(card: Card) {
    await client.cancelQueries({ queryKey: QUERY_KEYS.board });
    client.setQueryData<Board | null>(QUERY_KEYS.board, (current) =>
      current
        ? {
            ...current,
            cards: current.cards.some((item) => item.id === card.id)
              ? current.cards.map((item) => (item.id === card.id ? card : item))
              : [...current.cards, card],
          }
        : current,
    );
  }

  function announceMove(card: Card, from: string) {
    if (from === card.stageId) return;
    const label =
      stages.find((stage) => stage.id === card.stageId)?.name ??
      "another stage";
    setUndo({
      cardId: card.id,
      from,
      to: card.stageId,
      label,
      expires: Date.now() + TIMING.undoMs,
    });
    setNotice(`Moved “${card.title}” to ${label}.`);
  }

  const createBoard = useMutation({
    mutationFn: (creatorType: CreatorType) => api.createBoard({ creatorType }),
    onSuccess: (result) => client.setQueryData(QUERY_KEYS.board, result),
    onSettled: refresh,
  });
  const createCard = useMutation({
    mutationFn: (title: string) => api.createCard(title),
    onSuccess: async (card) => {
      await acceptCard(card);
      setCapture("");
      setArchive(false);
      setSearch("");
      setTag("");
      setNotice(`Captured “${card.title}”.`);
      captureRef.current?.focus();
    },
    onSettled: refresh,
  });
  const move = useMutation({
    mutationFn: async (input: Move) => {
      if ("undo" in input) {
        const latest = await api.getBoard();
        const current = latest?.cards.find(
          (card) => card.id === input.undo.cardId,
        );
        if (!current || current.stageId !== input.undo.to)
          throw new Error(
            "This card has moved again. Open it to choose its stage.",
          );
        if (!latest?.stages.some((stage) => stage.id === input.undo.from))
          throw new Error("The original stage no longer exists.");
        return api.updateCard(current.id, {
          version: current.version,
          stageId: input.undo.from,
        });
      }
      return api.updateCard(input.card.id, {
        version: input.card.version,
        stageId: input.stageId,
      });
    },
    onSuccess: async (card, input) => {
      await acceptCard(card);
      if ("undo" in input) {
        setUndo(null);
        setNotice(`Move undone for “${card.title}”.`);
      } else announceMove(card, input.card.stageId);
    },
    onSettled: async () => {
      try {
        await refresh();
      } finally {
        operationLock.current = false;
      }
    },
  });
  const signout = useMutation({
    mutationFn: async () => {
      const result = await auth.signOut();
      if (result.error)
        throw new Error(result.error.message || "Could not sign out.");
    },
    onSuccess: async () => {
      await client.cancelQueries();
      client.clear();
      await onSignedOut();
    },
  });
  const busy = move.isPending || createCard.isPending || signout.isPending;

  function moveCard(card: Card, stageId: string) {
    if (
      operationLock.current ||
      busy ||
      selected ||
      stageEditor ||
      card.stageId === stageId
    )
      return;
    operationLock.current = true;
    move.mutate({ card, stageId });
  }

  const tags = availableTags(board?.cards ?? [], archive);
  const activeTag = tags.includes(tag) ? tag : "";
  const visibleCards = filterCards(
    board?.cards ?? [],
    archive,
    search,
    activeTag,
  );
  const filtered = Boolean(search.trim() || activeTag);

  return (
    <div className="workspace">
      <a className="skip-link" href="#board-content">
        Skip to board
      </a>
      <WorkspaceNav
        user={user}
        board={board}
        archive={archive}
        onView={(value) => {
          setArchive(value);
          setTag("");
          setSearch("");
        }}
        busy={busy}
        signingOut={signout.isPending}
        onSignOut={() => {
          if (
            !capture ||
            window.confirm("Discard your captured idea and sign out?")
          )
            signout.mutate();
        }}
      />
      <main className="workspace-main" id="board-content" tabIndex={-1}>
        <header className="topbar">
          <span>
            Workspace <span aria-hidden="true">/</span>{" "}
            <strong>{archive ? "Archive" : "Production board"}</strong>
          </span>
          <span className="workspace-label">Made for the work you make.</span>
        </header>
        <ErrorNotice error={signout.error} />
        <div className="sr-only" role="status">
          {notice}
        </div>
        {boardQuery.isPending ? (
          <section className="center-state" aria-busy="true">
            <p>Getting your ideas together…</p>
          </section>
        ) : boardQuery.isError && !board ? (
          <section className="center-state">
            <h1>Your board couldn’t load</h1>
            <ErrorNotice error={boardQuery.error} />
            <button type="button" onClick={() => boardQuery.refetch()}>
              Try again
            </button>
            {boardQuery.error instanceof ApiError &&
              boardQuery.error.status === 401 && (
                <p>Session expired. Sign out above, then sign back in.</p>
              )}
          </section>
        ) : board === null ? (
          <section className="onboarding">
            <p className="eyebrow">A PLACE TO START</p>
            <h1>What do you make?</h1>
            <p className="lead">We’ll set the stage. You bring the ideas.</p>
            <p className="muted">
              Choose a starting point. Every stage is yours to customize.
            </p>
            <div className="template-grid">
              {CREATOR_TYPES.map((type) => (
                <button
                  className="template"
                  key={type}
                  type="button"
                  disabled={createBoard.isPending || signout.isPending}
                  onClick={() => createBoard.mutate(type)}
                >
                  <span className="template-mark">
                    {CREATOR_OPTIONS[type].mark}
                  </span>
                  <h2>
                    {CREATOR_OPTIONS[type].label}
                    <span aria-hidden="true">↗</span>
                  </h2>
                  <p>{CREATOR_OPTIONS[type].description}</p>
                  <span className="template-stages">
                    {TEMPLATES[type].join(" → ")}
                  </span>
                </button>
              ))}
            </div>
            {createBoard.isPending && (
              <p role="status">Building your starting board…</p>
            )}
            <ErrorNotice error={createBoard.error} />
          </section>
        ) : board ? (
          <>
            <section className="board-heading">
              <div>
                <p className="eyebrow">
                  {CREATOR_OPTIONS[board.creatorType].label.toUpperCase()}{" "}
                  STUDIO
                </p>
                <h1>{archive ? "The archive" : "Your work, in motion."}</h1>
                <p className="muted">
                  {archive
                    ? "Finished for now. Ready whenever you are."
                    : "Capture a spark. Give it shape. Put it out into the world."}
                </p>
              </div>
              <button
                type="button"
                className="primary"
                disabled={busy || board.cards.length >= LIMITS.cards}
                onClick={() => captureRef.current?.focus()}
              >
                <Icon name="plus" />
                Capture idea
              </button>
            </section>
            <div className="board-toolbar">
              <label className="search-field">
                <span className="sr-only">
                  Search ideas by title, notes or tags
                </span>
                <Icon name="search" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search ideas…"
                />
              </label>
              <label className="tag-filter">
                <span className="sr-only">Filter by tag</span>
                <select
                  value={activeTag}
                  onChange={(event) => setTag(event.target.value)}
                >
                  <option value="">All tags</option>
                  {tags.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              {filtered && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSearch("");
                    setTag("");
                  }}
                >
                  Clear filters
                </button>
              )}
              <button
                type="button"
                className="view-toggle"
                aria-pressed={overview}
                onClick={() => setOverview(!overview)}
              >
                <Icon name="grid" />
                Overview
              </button>
            </div>
            <div className="board-meta">
              <span role="status">
                {filtered ? `${visibleCards.length} of ` : ""}
                {board.cards.filter((card) => card.archived === archive).length}{" "}
                {archive ? "archived" : "active"} ideas{" "}
                <span aria-hidden="true">/</span> {stages.length} stages
              </span>
              <span
                className={`sync-status${boardQuery.isError ? " sync-failed" : ""}`}
              >
                {boardQuery.isError
                  ? "Sync interrupted"
                  : boardQuery.isFetching
                    ? "Syncing…"
                    : "Connected · auto-sync on"}
              </span>
            </div>
            {boardQuery.isError && (
              <div className="sync-error">
                <ErrorNotice error={boardQuery.error} />
                <button type="button" onClick={() => boardQuery.refetch()}>
                  Retry sync
                </button>
              </div>
            )}
            <ErrorNotice error={move.error} />
            {filtered && !visibleCards.length && (
              <section className="results-empty">
                <Icon name="search" />
                <div>
                  <h2>No ideas found</h2>
                  <p>Try another word or clear your filters.</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setTag("");
                  }}
                >
                  Clear filters
                </button>
              </section>
            )}
            {archive && !board.cards.some((card) => card.archived) && (
              <section className="results-empty">
                <Icon name="archive" />
                <div>
                  <h2>A place for finished work</h2>
                  <p>
                    Archive an idea from its details. You can restore it
                    anytime.
                  </p>
                </div>
              </section>
            )}
            <BoardCanvas
              stages={stages}
              cards={visibleCards}
              allCards={board.cards}
              archive={archive}
              overview={overview}
              filtered={filtered}
              busy={busy}
              dragging={dragging}
              onDrag={setDragging}
              onMove={moveCard}
              onOpen={setSelected}
              onEditStage={setStageEditor}
              onCapture={() => captureRef.current?.focus()}
            />
            <form
              className="capture-bar"
              onSubmit={(event) => {
                event.preventDefault();
                if (
                  !busy &&
                  capture.trim() &&
                  board.cards.length < LIMITS.cards
                )
                  createCard.mutate(capture.trim());
              }}
            >
              <label className="sr-only" htmlFor="capture">
                Capture an idea
              </label>
              <span className="capture-mark" aria-hidden="true">
                +
              </span>
              <input
                id="capture"
                ref={captureRef}
                value={capture}
                onChange={(event) => setCapture(event.target.value)}
                maxLength={LIMITS.title}
                placeholder={`Drop an idea into ${stages[0]?.name ?? "your board"}…`}
                disabled={createCard.isPending || signout.isPending}
                required
              />
              <button
                className="primary"
                type="submit"
                disabled={
                  busy || !capture.trim() || board.cards.length >= LIMITS.cards
                }
              >
                {createCard.isPending ? "Capturing…" : "Capture idea →"}
              </button>
              <div className="capture-help">
                <span>
                  {board.cards.length >= LIMITS.cards
                    ? `Your board has reached its ${LIMITS.cards}-card limit.`
                    : "Just a title is enough. The rest can come later."}
                </span>
                <span>
                  {capture.length}/{LIMITS.title}
                </span>
              </div>
              <ErrorNotice error={createCard.error} />
            </form>
            {selected && (
              <CardDetail
                card={selected}
                latest={
                  board.cards.find((card) => card.id === selected.id) ??
                  selected
                }
                stages={stages}
                onClose={() => setSelected(null)}
                onSaved={async (card, previousStage) => {
                  await acceptCard(card);
                  announceMove(card, previousStage);
                  await refresh();
                }}
              />
            )}
            {stageEditor && (
              <StageEditor
                stage={stageEditor === "new" ? null : stageEditor}
                board={board}
                onClose={() => setStageEditor(null)}
              />
            )}
          </>
        ) : null}
        {undo && (
          <div className="undo-toast" role="status">
            <span>
              Moved to <strong>{undo.label}</strong>
            </span>
            <button
              type="button"
              disabled={busy || Boolean(selected) || Boolean(stageEditor)}
              onClick={() => {
                if (Date.now() >= undo.expires || operationLock.current) return;
                operationLock.current = true;
                move.mutate({ undo });
              }}
            >
              {move.isPending ? "Working…" : "Undo"}
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Dismiss undo"
              onClick={() => setUndo(null)}
            >
              ×
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
