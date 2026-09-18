import type { Board, Card } from "@cutline/shared";

export type UndoMove = {
  card: Card;
  previousStageId: string;
  expiresAt: number;
};

export function undoInput(
  board: Board | null,
  undo: UndoMove,
  now = Date.now(),
) {
  if (now >= undo.expiresAt) throw new Error("The undo window has expired.");
  const current = board?.cards.find((card) => card.id === undo.card.id);
  if (
    !current ||
    current.version !== undo.card.version ||
    current.stageId !== undo.card.stageId
  ) {
    throw new Error(
      "This card changed after the move. Open its details to choose a stage.",
    );
  }
  if (!board?.stages.some((stage) => stage.id === undo.previousStageId)) {
    throw new Error("The original stage no longer exists.");
  }
  return { version: current.version, stageId: undo.previousStageId };
}

export function replaceCard(board: Board | null | undefined, card: Card) {
  if (!board || board.id !== card.boardId) return board;
  return {
    ...board,
    cards: board.cards.some((item) => item.id === card.id)
      ? board.cards.map((item) => (item.id === card.id ? card : item))
      : [...board.cards, card],
  };
}
