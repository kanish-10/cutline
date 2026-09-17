import type { Card, Stage } from "@cutline/shared";
import { DATE_FORMAT, UI } from "../constants";
import { checklistProgress } from "./board-model";
import { Icon } from "./brand";

export function IdeaCard({
  card,
  next,
  busy,
  onOpen,
  onMove,
  onDrag,
}: {
  card: Card;
  next?: Stage | undefined;
  busy: boolean;
  onOpen: (card: Card) => void;
  onMove: (card: Card, stageId: string) => void;
  onDrag: (id: string | null) => void;
}) {
  const { done, total, percent } = checklistProgress(card);
  return (
    <article
      className="idea-card"
      draggable={!busy && !card.archived}
      onDragStart={(event) => {
        event.dataTransfer.setData(UI.dragMime, card.id);
        event.dataTransfer.effectAllowed = "move";
        onDrag(card.id);
      }}
      onDragEnd={() => onDrag(null)}
    >
      <button
        className="card-open"
        type="button"
        onClick={() => onOpen(card)}
        disabled={busy}
        aria-label={`Open idea: ${card.title}`}
      >
        <span className="card-title">{card.title}</span>
        {card.notes && <span className="card-excerpt">{card.notes}</span>}
        {!!card.tags.length && (
          <span className="tag-row">
            {card.tags.slice(0, UI.cardTagPreview).map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
            {card.tags.length > UI.cardTagPreview && (
              <span
                className="tag"
                title={card.tags.slice(UI.cardTagPreview).join(", ")}
              >
                +{card.tags.length - UI.cardTagPreview}
              </span>
            )}
          </span>
        )}
      </button>
      {!!total && (
        <div className="card-progress">
          <div>
            <span>Checklist</span>
            <span>
              {done}/{total}
            </span>
          </div>
          <progress
            value={done}
            max={total}
            aria-label={`${card.title}: ${percent}% of checklist complete`}
          />
        </div>
      )}
      <footer className="card-meta">
        <time dateTime={card.createdAt} title="Created">
          {new Date(card.createdAt).toLocaleDateString(
            UI.dateLocale,
            DATE_FORMAT,
          )}
        </time>
        {!!card.links.length && (
          <span className="resource-count">
            <Icon name="link" />
            {card.links.length}
            <span className="sr-only"> resources</span>
          </span>
        )}
        {!card.archived && next ? (
          <button
            className="advance"
            type="button"
            disabled={busy}
            onClick={() => onMove(card, next.id)}
            aria-label={`Move ${card.title} to ${next.name}`}
            title={`Move to ${next.name}`}
          >
            Move
            <Icon name="arrow" />
          </button>
        ) : (
          <span className="done-label">
            {card.archived ? "Archived" : "Final stage"}
          </span>
        )}
      </footer>
    </article>
  );
}
