"use client";

import type { Board, Stage, UpdateStage } from "@cutline/shared";
import {
  createStageSchema,
  LIMITS,
  QUERY_KEYS,
  STAGE_COLORS,
} from "@cutline/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UI } from "../constants";
import { Modal } from "./modal";
import { useUnsavedChanges } from "./use-unsaved-changes";
import { ErrorNotice, useClients } from "./workspace";

type Action =
  | { kind: "save" }
  | { kind: "reorder"; direction: "left" | "right" }
  | { kind: "delete" };

export function StageEditor({
  stage,
  board,
  onClose,
}: {
  stage: Stage | null;
  board: Board;
  onClose: () => void;
}) {
  const { api } = useClients();
  const client = useQueryClient();
  const initialColor =
    stage?.color ??
    STAGE_COLORS[board.stages.length % STAGE_COLORS.length] ??
    STAGE_COLORS[0];
  const [name, setName] = useState(stage?.name ?? "");
  const [color, setColor] = useState<string>(initialColor);
  const [savedName, setSavedName] = useState(stage?.name ?? "");
  const [savedColor, setSavedColor] = useState(initialColor);
  const [message, setMessage] = useState("");
  const dirty = name !== savedName || color !== savedColor;
  useUnsavedChanges(dirty);
  const stages = [...board.stages].sort((a, b) => a.position - b.position);
  const position = stages.findIndex((item) => item.id === stage?.id);
  const cardCount = board.cards.filter(
    (card) => card.stageId === stage?.id,
  ).length;
  const missing = Boolean(stage && position < 0);
  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      if (action.kind === "save") {
        const parsed = createStageSchema.safeParse({ name, color });
        if (!parsed.success)
          throw new Error(
            parsed.error.issues[0]?.message ?? "Check the stage details.",
          );
        if (!stage) return api.createStage(parsed.data);
        const input: UpdateStage = {
          ...(name !== savedName ? { name: parsed.data.name } : {}),
          ...(color !== savedColor ? { color: parsed.data.color } : {}),
        };
        return api.updateStage(stage.id, input);
      }
      if (!stage) throw new Error("Save this stage first.");
      if (action.kind === "reorder")
        return api.updateStage(stage.id, { direction: action.direction });
      return api.deleteStage(stage.id);
    },
    onSuccess: async (result, action) => {
      if (action.kind === "save" && "name" in result) {
        setName(result.name);
        setSavedName(result.name);
        setColor(result.color);
        setSavedColor(result.color);
        setMessage("Stage saved.");
      }
      if (action.kind === "reorder")
        setMessage(`Moved stage ${action.direction}.`);
      await client.invalidateQueries({ queryKey: QUERY_KEYS.board });
      if (action.kind === "delete" || !stage) onClose();
    },
    onError: () => client.invalidateQueries({ queryKey: QUERY_KEYS.board }),
  });
  function close() {
    if (!mutation.isPending && (!dirty || window.confirm(UI.discardMessage)))
      onClose();
  }

  return (
    <Modal
      title={stage ? "Shape your stage" : "Make a little more room"}
      onClose={close}
      busy={mutation.isPending}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!mutation.isPending) mutation.mutate({ kind: "save" });
        }}
      >
        <fieldset
          disabled={mutation.isPending || missing}
          className="detail-fields"
        >
          <label>
            Stage name
            <input
              required
              maxLength={LIMITS.stageName}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setMessage("");
              }}
              placeholder="What happens here?"
            />
          </label>
          <fieldset className="color-fieldset">
            <legend>Stage color</legend>
            <div className="swatches">
              {STAGE_COLORS.map((value, index) => (
                <label
                  className="swatch"
                  key={value}
                  style={{ backgroundColor: value }}
                >
                  <input
                    type="radio"
                    name="stage-color"
                    value={value}
                    checked={color === value}
                    onChange={() => {
                      setColor(value);
                      setMessage("");
                    }}
                    aria-label={`Color ${index + 1}: ${value}`}
                  />
                  <span aria-hidden="true">{color === value ? "✓" : ""}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <ErrorNotice error={mutation.error} />
          {message && (
            <p className="success" role="status">
              {message}
            </p>
          )}
          <button
            className="primary full"
            type="submit"
            disabled={
              !name.trim() ||
              (Boolean(stage) && !dirty) ||
              (!stage && stages.length >= LIMITS.stages)
            }
          >
            {mutation.isPending
              ? "Working…"
              : stage
                ? "Save stage"
                : "Add stage →"}
          </button>
          {stage && (
            <section className="stage-management">
              <h3>Put it in the right place</h3>
              <p className="muted">
                Stage {position + 1} of {stages.length}. Reordering changes the
                next stage for every card.
              </p>
              <div className="button-row">
                <button
                  type="button"
                  disabled={position <= 0}
                  onClick={() =>
                    mutation.mutate({ kind: "reorder", direction: "left" })
                  }
                >
                  ← Move left
                </button>
                <button
                  type="button"
                  disabled={position >= stages.length - 1}
                  onClick={() =>
                    mutation.mutate({ kind: "reorder", direction: "right" })
                  }
                >
                  Move right →
                </button>
              </div>
              <hr />
              <h3>Remove stage</h3>
              <p className="muted">
                {cardCount
                  ? `Move all ${cardCount} cards out first, including archived cards.`
                  : stages.length <= 1
                    ? "Keep at least one stage on your board."
                    : "This stage is empty and can be deleted."}
              </p>
              <button
                className="danger-button"
                type="button"
                disabled={cardCount > 0 || stages.length <= 1}
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete “${stage.name}”?${dirty ? " Unsaved stage edits will be discarded." : ""}`,
                    )
                  )
                    mutation.mutate({ kind: "delete" });
                }}
              >
                Delete empty stage
              </button>
            </section>
          )}
        </fieldset>
        {missing && (
          <p className="error" role="alert">
            This stage was deleted elsewhere. Close this dialog to continue.
          </p>
        )}
      </form>
    </Modal>
  );
}
