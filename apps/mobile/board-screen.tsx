import type { Board, Card, SessionUser, Stage } from "@cutline/shared";
import {
  ApiError,
  createBoardSchema,
  createCardSchema,
  LIMITS,
  QUERY_KEYS,
  TIMING,
  updateCardSchema,
} from "@cutline/shared";
import {
  focusManager,
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState, Text, View } from "react-native";
import { BoardCanvas } from "./board-canvas";
import { BoardHeader } from "./board-header";
import { BoardOnboarding } from "./board-onboarding";
import type { UndoMove } from "./board-state";
import { replaceCard, undoInput } from "./board-state";
import { CaptureBar } from "./capture-bar";
import { CardDetail } from "./card-detail";
import { useClients } from "./clients";
import { StageEditor } from "./stage-editor";
import { Button, ErrorNotice, Loading, Screen, styles, useAction } from "./ui";

export function Workspace(props: {
  user: SessionUser;
  recheckSession: () => void;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: TIMING.staleMs,
            refetchInterval: TIMING.pollMs,
            retry: (count, error) =>
              count < 1 && !(error instanceof ApiError && error.status < 500),
          },
          mutations: { retry: false },
        },
      }),
  );
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (state) =>
      focusManager.setFocused(state === "active"),
    );
    return () => {
      subscription.remove();
      client.clear();
    };
  }, [client]);
  return (
    <QueryClientProvider client={client}>
      <BoardScreen {...props} />
    </QueryClientProvider>
  );
}

function BoardScreen({
  user,
  recheckSession,
}: {
  user: SessionUser;
  recheckSession: () => void;
}) {
  const { api, authClient } = useClients();
  const client = useQueryClient();
  const query = useQuery({ queryKey: QUERY_KEYS.board, queryFn: api.getBoard });
  const action = useAction();
  const [capture, setCapture] = useState("");
  const [archive, setArchive] = useState(false);
  const [selected, setSelected] = useState<Card | null>(null);
  const [editingStage, setEditingStage] = useState<Stage | "new" | null>(null);
  const [undo, setUndo] = useState<UndoMove | null>(null);
  const [notice, setNotice] = useState("");
  const board = query.data;
  const stages = [...(board?.stages ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  const refresh = () =>
    client.invalidateQueries({ queryKey: QUERY_KEYS.board });
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(
      () => setUndo(null),
      Math.max(0, undo.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [undo]);

  async function acceptCard(card: Card) {
    await client.cancelQueries({ queryKey: QUERY_KEYS.board });
    client.setQueryData<Board | null>(QUERY_KEYS.board, (current) =>
      replaceCard(current, card),
    );
    void refresh();
  }

  function advance(card: Card, next: Stage) {
    void action.run(async () => {
      try {
        const result = await api.updateCard(
          card.id,
          updateCardSchema.parse({ version: card.version, stageId: next.id }),
        );
        await acceptCard(result);
        setUndo({
          card: result,
          previousStageId: card.stageId,
          expiresAt: Date.now() + TIMING.undoMs,
        });
        setNotice(`Moved “${card.title}” to ${next.name}.`);
      } finally {
        void refresh();
      }
    });
  }

  function captureIdea() {
    void action.run(async () => {
      const input = createCardSchema.parse({ title: capture });
      const card = await api.createCard(input.title);
      await acceptCard(card);
      setCapture("");
      setNotice(`Captured “${card.title}”.`);
    });
  }

  function signOut() {
    return action.run(async () => {
      const result = await authClient.signOut();
      await client.cancelQueries();
      client.clear();
      recheckSession();
      if (result.error)
        throw new Error(result.error.message ?? "Sign out failed.");
    });
  }

  return (
    <Screen>
      {board ? (
        <>
          <BoardHeader
            user={user}
            capture={capture}
            pending={action.pending}
            onSignOut={signOut}
          />
          <View style={local.notices}>
            <ErrorNotice error={action.error} />
            {query.error && (
              <>
                <ErrorNotice error={query.error} />
                <Button
                  title="Retry sync / check session"
                  disabled={query.isFetching}
                  onPress={() => {
                    recheckSession();
                    void query.refetch();
                  }}
                />
              </>
            )}
          </View>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.heading}>
              {archive ? "Archive" : "Your pipeline"}
            </Text>
            <Button
              title={archive ? "Back to board" : "Archive"}
              selected={archive}
              onPress={() => setArchive(!archive)}
            />
          </View>
          <View style={local.notices}>
            <Text style={styles.muted}>
              {board.cards.filter((card) => card.archived === archive).length}{" "}
              {archive ? "archived" : "active"} ideas ·{" "}
              {query.isFetching ? "Syncing…" : "Tap a card to open it"}
            </Text>
          </View>
          <ErrorNotice error={action.error} />
          <BoardCanvas
            board={board}
            stages={stages}
            archive={archive}
            pending={action.pending}
            onOpen={setSelected}
            onAdvance={advance}
            onEditStage={setEditingStage}
            onAddStage={() => setEditingStage("new")}
          />
          {notice ? (
            <Text accessibilityLiveRegion="polite" style={local.notice}>
              {notice}
            </Text>
          ) : null}
          {undo && (
            <View style={local.undo}>
              <Text style={[styles.muted, styles.flex]}>
                Moved “{undo.card.title}”
              </Text>
              <Button
                title="Undo"
                disabled={
                  action.pending || Boolean(selected) || Boolean(editingStage)
                }
                onPress={() => {
                  const snapshot = undo;
                  void action.run(async () => {
                    try {
                      const latest = await api.getBoard();
                      const card = await api.updateCard(
                        snapshot.card.id,
                        undoInput(latest, snapshot),
                      );
                      await acceptCard(card);
                      setUndo(null);
                      setNotice("Move undone.");
                    } finally {
                      void refresh();
                    }
                  });
                }}
              />
            </View>
          )}
          {!archive && (
            <CaptureBar
              value={capture}
              onChange={setCapture}
              onCapture={captureIdea}
              pending={action.pending}
              full={board.cards.length >= LIMITS.cards}
              stage={stages[0]?.name ?? "your board"}
            />
          )}
          {selected && (
            <CardDetail
              card={selected}
              latest={board.cards.find((card) => card.id === selected.id)}
              stages={stages}
              onClose={() => setSelected(null)}
              onSaved={acceptCard}
              refresh={refresh}
            />
          )}
          {editingStage && (
            <StageEditor
              stage={editingStage === "new" ? null : editingStage}
              board={board}
              onClose={() => setEditingStage(null)}
            />
          )}
        </>
      ) : (
        <>
          <BoardHeader
            user={user}
            capture={capture}
            pending={action.pending}
            onSignOut={signOut}
          />
          <View style={local.notices}>
            <ErrorNotice error={action.error} />
            {query.error && (
              <>
                <ErrorNotice error={query.error} />
                <Button
                  title="Retry sync / check session"
                  disabled={query.isFetching}
                  onPress={() => {
                    recheckSession();
                    void query.refetch();
                  }}
                />
              </>
            )}
          </View>
          {query.isPending ? (
            <Loading label="Opening your workspace…" />
          ) : board === null ? (
            <BoardOnboarding
              pending={action.pending}
              onChoose={(creatorType) => {
                void action.run(async () => {
                  const result = await api.createBoard(
                    createBoardSchema.parse({ creatorType }),
                  );
                  await client.cancelQueries({ queryKey: QUERY_KEYS.board });
                  client.setQueryData(QUERY_KEYS.board, result);
                  void refresh();
                });
              }}
            />
          ) : null}
        </>
      )}
    </Screen>
  );
}

const local = {
  notices: { paddingHorizontal: 20 },
  undo: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    flexDirection: "row" as const,
    gap: 12,
    alignItems: "center" as const,
  },
  notice: { paddingHorizontal: 20, paddingVertical: 4, ...styles.muted },
};
