"use client";

import type {
  Board,
  BoardSummary,
  Card,
  CreateBoard,
  CreatorType,
  SessionUser,
  Stage,
} from "@cutline/shared";
import {
  ApiError,
  CREATOR_TYPES,
  createBoardSchema,
  LIMITS,
  QUERY_KEYS,
  TEMPLATES,
  TIMING,
} from "@cutline/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { CREATOR_OPTIONS } from "../constants";
import { BoardCanvas } from "./board-canvas";
import { availableTags, filterCards, selectBoardId } from "./board-model";
import { Icon } from "./brand";
import { CardDetail } from "./card-detail";
import { Modal } from "./modal";
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
  const { api } = useClients();
  const boardsQuery = useQuery({
    queryKey: QUERY_KEYS.boards,
    queryFn: api.getBoards,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const boards = boardsQuery.data ?? [];
  const boardId = selectBoardId(boards, selectedId);
  useEffect(() => {
    if (boardsQuery.data) setSelectedId(boardId);
  }, [boardId, boardsQuery.data]);
  return (
    <SelectedBoardScreen
      key={boardId ?? "onboarding"}
      user={user}
      onSignedOut={onSignedOut}
      boardId={boardId}
      boards={boards}
      boardsLoading={boardsQuery.isPending}
      boardsError={boardsQuery.error}
      onRetryBoards={() => void boardsQuery.refetch()}
      onSelectBoard={setSelectedId}
    />
  );
}

function SelectedBoardScreen({
  user,
  onSignedOut,
  boardId,
  boards,
  boardsLoading,
  boardsError,
  onRetryBoards,
  onSelectBoard,
}: {
  user: SessionUser;
  onSignedOut: () => unknown;
  boardId: string | null;
  boards: BoardSummary[];
  boardsLoading: boolean;
  boardsError: unknown;
  onRetryBoards: () => void;
  onSelectBoard: (id: string) => void;
}) {
  const { api, auth } = useClients(boardId ?? undefined);
  const client = useQueryClient();
  const boardKey = QUERY_KEYS.boardById(boardId ?? "");
  const boardQuery = useQuery({
    queryKey: boardKey,
    queryFn: api.getBoard,
    enabled: boardId !== null,
  });
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [boardName, setBoardName] = useState("");
  const [creatorType, setCreatorType] = useState<CreatorType>("video");
  const [boardValidation, setBoardValidation] = useState<unknown>(null);
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
  useUnsavedChanges(Boolean(capture || boardName));
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: boardKey }),
      client.invalidateQueries({ queryKey: QUERY_KEYS.boards }),
    ]);
  const board = boardId ? boardQuery.data : null;

  useEffect(() => {
    if (
      !boardId ||
      !(
        boardQuery.data === null ||
        (boardQuery.error instanceof ApiError &&
          boardQuery.error.status === 404)
      )
    )
      return;
    client.setQueryData<BoardSummary[]>(QUERY_KEYS.boards, (current) =>
      current?.filter((item) => item.id !== boardId),
    );
    void client.invalidateQueries({ queryKey: QUERY_KEYS.boards });
  }, [boardId, boardQuery.data, boardQuery.error, client]);
  const stages = [...(board?.stages ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const activeCount = board?.cards.filter((card) => !card.archived).length ?? 0;
  const captureFull = activeCount >= LIMITS.cards;

  useEffect(() => {
    if (!undo) return;
    const timer = window.setTimeout(
      () => setUndo(null),
      Math.max(0, undo.expires - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [undo]);

  async function acceptCard(card: Card) {
    const key = QUERY_KEYS.boardById(card.boardId);
    await client.cancelQueries({ queryKey: key });
    client.setQueryData<Board | null>(key, (current) =>
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
    mutationFn: (input: CreateBoard) => api.createBoard(input),
    onSuccess: async (result) => {
      await client.cancelQueries({ queryKey: QUERY_KEYS.boards });
      client.setQueryData(QUERY_KEYS.boardById(result.id), result);
      client.setQueryData<BoardSummary[]>(QUERY_KEYS.boards, (current = []) => [
        ...current.filter((item) => item.id !== result.id),
        {
          id: result.id,
          name: result.name,
          createdAt: result.createdAt,
          creatorType: result.creatorType,
          cardCount: result.cards.length,
        },
      ]);
      onSelectBoard(result.id);
    },
    onSettled: () => client.invalidateQueries({ queryKey: QUERY_KEYS.boards }),
  });
  const deleteBoard = useMutation({
    mutationFn: (id: string) => api.deleteBoard(id),
    onSuccess: async (_, id) => {
      await client.cancelQueries({ queryKey: QUERY_KEYS.boards });
      await client.cancelQueries({ queryKey: QUERY_KEYS.boardById(id) });
      client.removeQueries({ queryKey: QUERY_KEYS.boardById(id) });
      client.setQueryData<BoardSummary[]>(QUERY_KEYS.boards, (current) =>
        current?.filter((item) => item.id !== id),
      );
    },
    onError: refresh,
    onSettled: () => client.invalidateQueries({ queryKey: QUERY_KEYS.boards }),
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
  const busy =
    move.isPending ||
    createCard.isPending ||
    signout.isPending ||
    createBoard.isPending ||
    deleteBoard.isPending;
  const switchingBlocked =
    busy || Boolean(selected || stageEditor || creatingBoard);

  function leaveBoard(action: () => void) {
    if (switchingBlocked || operationLock.current) return;
    if (
      capture &&
      !window.confirm("Discard your captured idea and leave this board?")
    )
      return;
    setCapture("");
    action();
  }

  function submitBoard(type: CreatorType) {
    if (busy) return;
    const parsed = createBoardSchema.safeParse({
      name: boardName,
      creatorType: type,
    });
    if (!parsed.success) {
      setBoardValidation(
        new Error("Give your board a name (1–80 characters)."),
      );
      return;
    }
    setBoardValidation(null);
    createBoard.mutate(parsed.data);
  }

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
        boards={boards}
        boardId={boardId}
        switchingBlocked={
          switchingBlocked || boardsLoading || Boolean(boardsError)
        }
        onSelectBoard={(id) => {
          if (id !== boardId) leaveBoard(() => onSelectBoard(id));
        }}
        onCreateBoard={() => leaveBoard(() => setCreatingBoard(true))}
        busy={switchingBlocked}
        signingOut={signout.isPending}
        onSignOut={() => {
          if (
            !(capture || boardName) ||
            window.confirm("Discard your unsaved draft and sign out?")
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
        {Boolean(boardsError) && (
          <div className="sync-error">
            <ErrorNotice error={boardsError} />
            <button type="button" onClick={onRetryBoards}>
              Retry board list
            </button>
          </div>
        )}
        <ErrorNotice error={deleteBoard.error} />
        <div className="sr-only" role="status">
          {notice}
        </div>
        {boardsLoading || (boardId && boardQuery.isPending) ? (
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
        ) : board === null && !boardId && !boardsError ? (
          <section className="onboarding">
            <p className="eyebrow">A PLACE TO START</p>
            <h1>What do you make?</h1>
            <p className="lead">We’ll set the stage. You bring the ideas.</p>
            <p className="muted">
              Choose a starting point. Every stage is yours to customize.
            </p>
            <label className="board-name-field">
              Board name
              <input
                value={boardName}
                maxLength={LIMITS.name}
                required
                disabled={busy}
                placeholder="My production board"
                onChange={(event) => setBoardName(event.target.value)}
              />
            </label>
            <ErrorNotice error={boardValidation} />
            <div className="template-grid">
              {CREATOR_TYPES.map((type) => (
                <button
                  className="template"
                  key={type}
                  type="button"
                  disabled={busy || !boardName.trim()}
                  onClick={() => submitBoard(type)}
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
                <h1>{archive ? `${board.name} · Archive` : board.name}</h1>
                <p className="muted">
                  {archive
                    ? "Finished for now. Ready whenever you are."
                    : "Capture a spark. Give it shape. Put it out into the world."}
                </p>
              </div>
              <button
                type="button"
                className="primary"
                disabled={busy || captureFull}
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
            <div className="board-management">
              <p id="delete-board-help" className="muted">
                Only empty boards can be deleted. Active and archived ideas
                count.
              </p>
              <button
                type="button"
                className="danger-button"
                aria-describedby="delete-board-help"
                disabled={
                  switchingBlocked ||
                  boardQuery.isError ||
                  boardQuery.isFetching ||
                  board.cards.length > 0 ||
                  (boards.find((item) => item.id === board.id)?.cardCount ??
                    0) > 0
                }
                onClick={() =>
                  leaveBoard(() => {
                    if (
                      window.confirm(
                        `Delete “${board.name}” and all its stages? This cannot be undone.`,
                      )
                    )
                      deleteBoard.mutate(board.id);
                  })
                }
              >
                {deleteBoard.isPending ? "Deleting…" : "Delete board"}
              </button>
            </div>
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
                    Archive an idea from its details to make room for restoring.
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
                if (!busy && capture.trim() && !captureFull)
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
                disabled={busy || !capture.trim() || captureFull}
              >
                {createCard.isPending ? "Capturing…" : "Capture idea →"}
              </button>
              <div className="capture-help">
                <span>
                  {captureFull
                    ? `Your board has reached its ${LIMITS.cards}-active-card limit. Archive an idea to make room.`
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
        {creatingBoard && (
          <Modal
            title="A new space for your ideas"
            busy={createBoard.isPending}
            onClose={() => {
              if (
                !createBoard.isPending &&
                (!boardName || window.confirm("Discard this new board?"))
              ) {
                setCreatingBoard(false);
                setBoardName("");
                setBoardValidation(null);
                createBoard.reset();
              }
            }}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submitBoard(creatorType);
              }}
            >
              <fieldset
                className="detail-fields"
                disabled={createBoard.isPending}
              >
                <label>
                  Board name
                  <input
                    value={boardName}
                    required
                    maxLength={LIMITS.name}
                    placeholder="A series, a channel, a fresh start…"
                    onChange={(event) => setBoardName(event.target.value)}
                  />
                </label>
                <label>
                  Starting template
                  <select
                    value={creatorType}
                    onChange={(event) =>
                      setCreatorType(event.target.value as CreatorType)
                    }
                  >
                    {CREATOR_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {CREATOR_OPTIONS[type].label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="muted">{TEMPLATES[creatorType].join(" → ")}</p>
                <p className="muted">Every stage is yours to customize.</p>
                <ErrorNotice error={boardValidation || createBoard.error} />
                <button
                  className="primary full"
                  type="submit"
                  disabled={!boardName.trim()}
                >
                  {createBoard.isPending ? "Creating…" : "Create board"}
                </button>
              </fieldset>
            </form>
          </Modal>
        )}
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
