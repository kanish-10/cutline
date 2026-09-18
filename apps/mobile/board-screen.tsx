import type {
  Board,
  BoardSummary,
  Card,
  CreateBoard,
  SessionUser,
  Stage,
} from "@cutline/shared";
import {
  ApiError,
  createBoardSchema,
  createCardSchema,
  ERROR_CODES,
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
import { Alert, AppState, ScrollView, Text, View } from "react-native";
import { BoardCanvas } from "./board-canvas";
import { BoardHeader } from "./board-header";
import { BoardOnboarding } from "./board-onboarding";
import type { UndoMove } from "./board-state";
import { replaceCard, undoInput } from "./board-state";
import { CaptureBar } from "./capture-bar";
import { CardDetail } from "./card-detail";
import { useClients } from "./clients";
import { StageEditor } from "./stage-editor";
import {
  Button,
  confirmDiscard,
  ErrorNotice,
  Loading,
  Screen,
  styles,
  useAction,
} from "./ui";

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

function BoardScreen(props: { user: SessionUser; recheckSession: () => void }) {
  const [boardId, setBoardId] = useState<string | null>(null);
  const [showBoards, setShowBoards] = useState(true);
  return showBoards || !boardId ? (
    <BoardList
      {...props}
      selectedId={boardId}
      onSelect={(id) => {
        setBoardId(id);
        setShowBoards(false);
      }}
    />
  ) : (
    <SelectedBoardScreen
      key={boardId}
      {...props}
      boardId={boardId}
      onBoards={() => setShowBoards(true)}
    />
  );
}

function BoardList({
  user,
  recheckSession,
  selectedId,
  onSelect,
}: {
  user: SessionUser;
  recheckSession: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { api, authClient } = useClients();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEYS.boards,
    queryFn: api.getBoards,
  });
  const action = useAction();
  const [creating, setCreating] = useState(false);
  const firstBoard = query.data?.length === 0;

  function createBoard(input: CreateBoard) {
    void action.run(async () => {
      const board = await api.createBoard(createBoardSchema.parse(input));
      await client.cancelQueries({ queryKey: QUERY_KEYS.boards });
      client.setQueryData(QUERY_KEYS.boardById(board.id), board);
      client.setQueryData<BoardSummary[]>(QUERY_KEYS.boards, (current) => [
        ...(current ?? []).filter((item) => item.id !== board.id),
        {
          id: board.id,
          name: board.name,
          createdAt: board.createdAt,
          creatorType: board.creatorType,
          cardCount: board.cards.length,
        },
      ]);
      void client.invalidateQueries({ queryKey: QUERY_KEYS.boards });
      onSelect(board.id);
    });
  }

  function deleteBoard(board: BoardSummary) {
    if (action.pending || board.cardCount !== 0) return;
    Alert.alert(
      `Delete “${board.name}”?`,
      "Only empty boards can be deleted. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete board",
          style: "destructive",
          onPress: () => {
            void action.run(async () => {
              try {
                await api.deleteBoard(board.id);
                await client.cancelQueries({
                  queryKey: QUERY_KEYS.boardById(board.id),
                });
                client.removeQueries({
                  queryKey: QUERY_KEYS.boardById(board.id),
                  exact: true,
                });
                await client.cancelQueries({ queryKey: QUERY_KEYS.boards });
                client.setQueryData<BoardSummary[]>(
                  QUERY_KEYS.boards,
                  (current) => current?.filter((item) => item.id !== board.id),
                );
              } catch (error) {
                if (
                  error instanceof ApiError &&
                  error.code === ERROR_CODES.boardNotEmpty
                ) {
                  throw new Error(
                    "This board contains cards, including archived cards, and cannot be deleted.",
                  );
                }
                throw error;
              } finally {
                void client.invalidateQueries({ queryKey: QUERY_KEYS.boards });
              }
            });
          },
        },
      ],
    );
  }

  return (
    <Screen>
      <BoardHeader
        user={user}
        capture={creating ? "new board" : ""}
        pending={action.pending}
        onBoards={() => {
          if (!action.pending)
            confirmDiscard(creating, () => setCreating(false));
        }}
        onSignOut={() =>
          action.run(async () => {
            const result = await authClient.signOut();
            await client.cancelQueries();
            client.clear();
            recheckSession();
            if (result.error)
              throw new Error(result.error.message ?? "Sign out failed.");
          })
        }
      />
      <View style={local.notices}>
        <ErrorNotice error={action.error} />
        <ErrorNotice error={query.error} />
        {query.error && (
          <Button
            title="Retry sync / check session"
            disabled={query.isFetching || action.pending}
            onPress={() => {
              recheckSession();
              void query.refetch();
            }}
          />
        )}
      </View>
      {query.isPending ? (
        <Loading label="Opening your boards…" />
      ) : creating || firstBoard ? (
        <>
          {creating && (
            <View style={local.notices}>
              <Button
                title="Cancel new board"
                disabled={action.pending}
                onPress={() => confirmDiscard(true, () => setCreating(false))}
              />
            </View>
          )}
          <BoardOnboarding pending={action.pending} onChoose={createBoard} />
        </>
      ) : query.data ? (
        <ScrollView contentContainerStyle={[styles.content, styles.form]}>
          <Text accessibilityRole="header" style={styles.heading}>
            Your boards
          </Text>
          <Button
            title="Create named board"
            primary
            disabled={action.pending}
            onPress={() => {
              action.clearError();
              setCreating(true);
            }}
          />
          {query.data.map((board) => (
            <View key={board.id} style={styles.card}>
              <Text style={styles.heading}>{board.name}</Text>
              <Text style={styles.muted}>
                {board.cardCount} cards, including archived
              </Text>
              <Button
                title={`Open ${board.name}`}
                selected={board.id === selectedId}
                disabled={action.pending}
                onPress={() => onSelect(board.id)}
              />
              <Button
                title="Delete empty board"
                label={`Delete ${board.name}`}
                danger
                disabled={
                  action.pending || query.isFetching || board.cardCount !== 0
                }
                onPress={() => deleteBoard(board)}
              />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function SelectedBoardScreen({
  user,
  recheckSession,
  boardId,
  onBoards,
}: {
  user: SessionUser;
  recheckSession: () => void;
  boardId: string;
  onBoards: () => void;
}) {
  const { api: workspaceApi, authClient } = useClients();
  const api = workspaceApi.forBoard(boardId);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: QUERY_KEYS.boardById(boardId),
    queryFn: api.getBoard,
  });
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
    client.invalidateQueries({ queryKey: QUERY_KEYS.boardById(boardId) });
  function openBoards() {
    if (action.pending || selected || editingStage) return;
    confirmDiscard(Boolean(capture), onBoards);
  }
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(
      () => setUndo(null),
      Math.max(0, undo.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [undo]);

  async function acceptCard(card: Card) {
    const queryKey = QUERY_KEYS.boardById(card.boardId);
    await client.cancelQueries({ queryKey });
    client.setQueryData<Board | null>(queryKey, (current) =>
      replaceCard(current, card),
    );
    void client.invalidateQueries({ queryKey });
    void client.invalidateQueries({ queryKey: QUERY_KEYS.boards });
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
            pending={
              action.pending || Boolean(selected) || Boolean(editingStage)
            }
            onBoards={openBoards}
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
              {archive ? `${board.name} · Archive` : board.name}
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
              full={
                board.cards.filter((card) => !card.archived).length >=
                LIMITS.cards
              }
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
            pending={
              action.pending || Boolean(selected) || Boolean(editingStage)
            }
            onBoards={openBoards}
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
            <ErrorNotice error="This board is no longer available. Choose another board." />
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
