import type { Card, Stage } from "@cutline/shared";
import { LIMITS } from "@cutline/shared";
import type { CSSProperties } from "react";
import { UI } from "../constants";
import { Icon } from "./brand";
import { IdeaCard } from "./idea-card";

export function BoardCanvas({
  stages,
  cards,
  allCards,
  archive,
  overview,
  filtered,
  busy,
  dragging,
  onDrag,
  onMove,
  onOpen,
  onEditStage,
  onCapture,
}: {
  stages: Stage[];
  cards: Card[];
  allCards: Card[];
  archive: boolean;
  overview: boolean;
  filtered: boolean;
  busy: boolean;
  dragging: string | null;
  onDrag: (id: string | null) => void;
  onMove: (card: Card, stageId: string) => void;
  onOpen: (card: Card) => void;
  onEditStage: (stage: Stage | "new") => void;
  onCapture: () => void;
}) {
  return (
    <section
      className={`board-canvas${overview ? " overview" : ""}`}
      aria-label="Production stages"
    >
      {stages.map((stage, index) => {
        const stageCards = cards.filter((card) => card.stageId === stage.id);
        return (
          <section
            className={`zone${dragging ? " drop-ready" : ""}`}
            key={stage.id}
            aria-label={`${stage.name} stage`}
            style={{ "--stage-color": stage.color } as CSSProperties}
            onDragOver={(event) => {
              if (dragging && !busy) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              const id = event.dataTransfer.getData(UI.dragMime);
              const card = allCards.find((item) => item.id === id);
              onDrag(null);
              if (card && id === dragging) onMove(card, stage.id);
            }}
          >
            <header className="zone-header">
              <span className="stage-dot" />
              <h2>{stage.name}</h2>
              <span className="count">{stageCards.length}</span>
              <button
                className="icon-button"
                type="button"
                aria-label={`Edit ${stage.name} stage`}
                disabled={busy}
                onClick={() => onEditStage(stage)}
              >
                ···
              </button>
            </header>
            <div className="zone-cards">
              {stageCards.map((card) => (
                <IdeaCard
                  key={card.id}
                  card={card}
                  next={stages[index + 1]}
                  busy={busy}
                  onOpen={onOpen}
                  onMove={onMove}
                  onDrag={onDrag}
                />
              ))}
            </div>
            {!stageCards.length && (
              <div className="empty-zone">
                <span className="empty-line" aria-hidden="true" />
                <p>
                  {filtered
                    ? "No matching ideas"
                    : archive
                      ? "No archived ideas"
                      : index === 0
                        ? "Start with a spark"
                        : "Ready for what’s next"}
                </p>
                {index === 0 && !archive && !filtered ? (
                  <button
                    className="text-button"
                    type="button"
                    disabled={busy}
                    onClick={onCapture}
                  >
                    Capture your first idea
                    <Icon name="plus" />
                  </button>
                ) : (
                  !filtered &&
                  !archive && <small>Move an idea here when it’s ready.</small>
                )}
              </div>
            )}
          </section>
        );
      })}
      <button
        className="add-stage-tile"
        type="button"
        disabled={busy || stages.length >= LIMITS.stages}
        onClick={() => onEditStage("new")}
      >
        <Icon name="plus" />
        {stages.length >= LIMITS.stages ? "Stage limit reached" : "Add stage"}
      </button>
    </section>
  );
}
