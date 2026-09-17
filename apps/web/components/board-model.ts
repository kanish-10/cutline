import type { Card } from "@cutline/shared";

export function filterCards(
  cards: Card[],
  archived: boolean,
  query: string,
  tag: string,
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return cards.filter((card) => {
    if (card.archived !== archived || (tag && !card.tags.includes(tag)))
      return false;
    const text = [card.title, card.notes, ...card.tags]
      .join(" ")
      .toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function availableTags(cards: Card[], archived: boolean) {
  return [
    ...new Set(
      cards
        .filter((card) => card.archived === archived)
        .flatMap((card) => card.tags),
    ),
  ].sort((a, b) => a.localeCompare(b));
}

export function checklistProgress(card: Pick<Card, "checklist">) {
  const total = card.checklist.length;
  const done = card.checklist.filter((item) => item.done).length;
  return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
}
