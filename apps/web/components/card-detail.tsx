"use client";

import type { Card, ChecklistItem, Stage, UpdateCard } from "@cutline/shared";
import {
  ApiError,
  LIMITS,
  QUERY_KEYS,
  safeUrlSchema,
  updateCardSchema,
} from "@cutline/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UI } from "../constants";
import { Modal } from "./modal";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { ErrorNotice, useClients } from "./workspace";

type Draft = {
  title: string;
  notes: string;
  stageId: string;
  checklist: ChecklistItem[];
  tags: string;
  links: string;
  archived: boolean;
};

function toDraft(card: Card): Draft {
  return {
    title: card.title,
    notes: card.notes,
    stageId: card.stageId,
    checklist: card.checklist.map((item) => ({ ...item })),
    tags: card.tags.join(", "),
    links: card.links.join("\n"),
    archived: card.archived,
  };
}

function changes(draft: Draft, baseline: Card): Partial<Draft> {
  const original = toDraft(baseline);
  return Object.fromEntries(
    Object.entries(draft).filter(
      ([key, value]) =>
        JSON.stringify(value) !== JSON.stringify(original[key as keyof Draft]),
    ),
  ) as Partial<Draft>;
}

export function CardDetail({
  card,
  latest,
  stages,
  onClose,
  onSaved,
}: {
  card: Card;
  latest: Card;
  stages: Stage[];
  onClose: () => void;
  onSaved: (card: Card, previousStage: string) => Promise<void>;
}) {
  const { api } = useClients();
  const client = useQueryClient();
  const [baseline, setBaseline] = useState(card);
  const [draft, setDraft] = useState(() => toDraft(card));
  const [validation, setValidation] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const dirty = Object.keys(changes(draft, baseline)).length > 0;
  const remoteChanged = latest.version !== baseline.version;
  useUnsavedChanges(dirty);
  const save = useMutation({
    mutationFn: (input: UpdateCard) => api.updateCard(card.id, input),
    onSuccess: async (result) => {
      const previousStage = baseline.stageId;
      setBaseline(result);
      setDraft(toDraft(result));
      setSaved(true);
      await onSaved(result, previousStage);
      if (previousStage !== result.stageId) onClose();
    },
    onError: () => client.invalidateQueries({ queryKey: QUERY_KEYS.board }),
  });
  const conflict =
    remoteChanged ||
    (save.error instanceof ApiError && save.error.status === 409);
  const next =
    stages[stages.findIndex((stage) => stage.id === draft.stageId) + 1];

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setValidation(null);
  }

  function close() {
    if (!save.isPending && (!dirty || window.confirm(UI.discardMessage)))
      onClose();
  }

  function submit(stageId = draft.stageId) {
    if (save.isPending || conflict) return;
    const changed = changes({ ...draft, stageId }, baseline);
    const input = {
      version: baseline.version,
      ...changed,
      ...(changed.tags !== undefined
        ? {
            tags: [
              ...new Set(
                changed.tags
                  .split(UI.tagSeparator)
                  .map((tag) => tag.trim())
                  .filter(Boolean),
              ),
            ],
          }
        : {}),
      ...(changed.links !== undefined
        ? {
            links: changed.links
              .split("\n")
              .map((link) => link.trim())
              .filter(Boolean),
          }
        : {}),
    };
    const parsed = updateCardSchema.safeParse(input);
    if (!parsed.success) {
      setValidation(
        new Error(
          parsed.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join(" · "),
        ),
      );
      return;
    }
    setValidation(null);
    save.mutate(parsed.data);
  }

  return (
    <Modal title="The idea, in detail" onClose={close} busy={save.isPending}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {conflict && (
          <section className="conflict" role="alert">
            <h3>A newer version is available</h3>
            <p>{UI.conflictMessage}</p>
            <details>
              <summary>Review latest saved card</summary>
              <h4>{latest.title}</h4>
              <p>
                Stage:{" "}
                {stages.find((stage) => stage.id === latest.stageId)?.name} ·{" "}
                {latest.archived ? "Archived" : "Active"}
              </p>
              <p className="preserve-lines">{latest.notes || "No notes"}</p>
              <ul>
                {latest.checklist.map((item) => (
                  <li key={item.id}>
                    {item.done ? "Complete: " : "To do: "}
                    {item.text}
                  </li>
                ))}
              </ul>
              <p>Tags: {latest.tags.join(", ") || "None"}</p>
              <p className="preserve-lines">
                Links: {latest.links.join("\n") || "None"}
              </p>
            </details>
            <div className="button-row">
              <button
                type="button"
                disabled={save.isPending || !remoteChanged}
                onClick={() => {
                  setDraft({ ...toDraft(latest), ...changes(draft, baseline) });
                  setBaseline(latest);
                  save.reset();
                  setSaved(false);
                }}
              >
                Keep my changed fields
              </button>
              <button
                type="button"
                disabled={save.isPending || !remoteChanged}
                onClick={() => {
                  if (!dirty || window.confirm(UI.discardMessage)) {
                    setBaseline(latest);
                    setDraft(toDraft(latest));
                    save.reset();
                    setValidation(null);
                    setSaved(false);
                  }
                }}
              >
                Load saved copy
              </button>
              <button
                type="button"
                disabled={save.isPending}
                onClick={() =>
                  client.invalidateQueries({ queryKey: QUERY_KEYS.board })
                }
              >
                Refresh latest
              </button>
            </div>
            <small>
              Merging preserves your changed fields and uses the latest version.
              Save after reviewing.
            </small>
          </section>
        )}
        <fieldset disabled={save.isPending} className="detail-fields">
          <label>
            Title
            <input
              className="title-input"
              value={draft.title}
              onChange={(event) => change("title", event.target.value)}
              maxLength={LIMITS.title}
              required
            />
          </label>
          <div className="detail-row">
            <label>
              Stage
              <select
                value={draft.stageId}
                onChange={(event) => change("stageId", event.target.value)}
              >
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="checkbox-label archive-label">
              <input
                type="checkbox"
                checked={draft.archived}
                onChange={(event) => change("archived", event.target.checked)}
              />{" "}
              Archived
            </label>
          </div>
          <label>
            <span id="card-notes-label">Notes</span>
            <textarea
              aria-labelledby="card-notes-label"
              rows={5}
              value={draft.notes}
              maxLength={LIMITS.notes}
              placeholder="The angle, the hook, the things you don’t want to forget…"
              onChange={(event) => change("notes", event.target.value)}
            />
          </label>
          <section
            className="checklist-section"
            aria-labelledby="checklist-heading"
          >
            <div className="section-heading">
              <h3 id="checklist-heading">Checklist</h3>
              <span className="muted">
                {draft.checklist.filter((item) => item.done).length} /{" "}
                {draft.checklist.length}
              </span>
            </div>
            {draft.checklist.map((item, index) => (
              <div className="checklist-item" key={item.id}>
                <input
                  type="checkbox"
                  aria-label={`Complete step ${index + 1}: ${item.text}`}
                  checked={item.done}
                  onChange={(event) =>
                    change(
                      "checklist",
                      draft.checklist.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, done: event.target.checked }
                          : entry,
                      ),
                    )
                  }
                />
                <input
                  aria-label={`Step ${index + 1}`}
                  className={item.done ? "completed" : ""}
                  value={item.text}
                  required
                  maxLength={LIMITS.checklistText}
                  onChange={(event) =>
                    change(
                      "checklist",
                      draft.checklist.map((entry) =>
                        entry.id === item.id
                          ? { ...entry, text: event.target.value }
                          : entry,
                      ),
                    )
                  }
                />
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove step ${index + 1}`}
                  onClick={() =>
                    change(
                      "checklist",
                      draft.checklist.filter((entry) => entry.id !== item.id),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              className="text-button"
              type="button"
              disabled={draft.checklist.length >= LIMITS.checklist}
              onClick={() =>
                change("checklist", [
                  ...draft.checklist,
                  { id: crypto.randomUUID(), text: "", done: false },
                ])
              }
            >
              + Add a step
            </button>
          </section>
          <label>
            Tags
            <input
              value={draft.tags}
              onChange={(event) => change("tags", event.target.value)}
              placeholder="Behind the scenes, tutorial, next season"
              aria-describedby="tags-hint"
            />
            <small id="tags-hint">
              Separate with commas. Up to {LIMITS.tags} tags, {LIMITS.tag}{" "}
              characters each.
            </small>
          </label>
          <label>
            Links & resources
            <textarea
              rows={3}
              value={draft.links}
              onChange={(event) => change("links", event.target.value)}
              placeholder="https://…"
              aria-describedby="links-hint"
            />
            <small id="links-hint">
              One http or https link per line. Up to {LIMITS.links} links; no
              files are uploaded.
            </small>
          </label>
          <div className="resource-links">
            {draft.links
              .split("\n")
              .map((link) => link.trim())
              .filter(Boolean)
              .filter((link, index, all) => all.indexOf(link) === index)
              .map((link) => {
                const result = safeUrlSchema.safeParse(link);
                return result.success ? (
                  <a
                    key={link}
                    href={result.data}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {new URL(result.data).hostname} ↗
                  </a>
                ) : null;
              })}
          </div>
          <ErrorNotice error={validation || save.error} />
          {saved && (
            <p className="success" role="status">
              All changes saved.
            </p>
          )}
          <footer className="detail-footer">
            <span className="muted">
              {save.isPending
                ? "Saving…"
                : dirty
                  ? "Unsaved changes"
                  : "Up to date"}
            </span>
            <div className="button-row">
              <button type="button" onClick={close}>
                Close
              </button>
              <button
                className="primary"
                type="submit"
                disabled={!dirty || conflict}
              >
                {save.isPending ? "Saving…" : "Save changes"}
              </button>
            </div>
            {next && !draft.archived && (
              <button
                className="advance-detail"
                type="button"
                disabled={conflict}
                onClick={() => submit(next.id)}
              >
                Save & move to {next.name} →
              </button>
            )}
          </footer>
        </fieldset>
      </form>
    </Modal>
  );
}
