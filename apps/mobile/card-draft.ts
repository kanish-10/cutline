import type { Card, UpdateCard } from "@cutline/shared";

export function parseList(value: string, separator: "," | "\n") {
  return [
    ...new Set(
      value
        .split(separator)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

export function draftOf(card: Card) {
  return {
    title: card.title,
    notes: card.notes,
    checklist: card.checklist,
    tags: card.tags.join(", "),
    links: card.links.join("\n"),
    stageId: card.stageId,
    archived: card.archived,
  };
}

export function cardChanges(
  base: Card,
  draft: ReturnType<typeof draftOf>,
): UpdateCard {
  const original = draftOf(base);
  const input: UpdateCard = { version: base.version };
  if (draft.title !== original.title) input.title = draft.title;
  if (draft.notes !== original.notes) input.notes = draft.notes;
  if (draft.stageId !== original.stageId) input.stageId = draft.stageId;
  if (draft.archived !== original.archived) input.archived = draft.archived;
  if (draft.tags !== original.tags) input.tags = parseList(draft.tags, ",");
  if (draft.links !== original.links)
    input.links = parseList(draft.links, "\n");
  if (JSON.stringify(draft.checklist) !== JSON.stringify(original.checklist))
    input.checklist = draft.checklist;
  return input;
}
