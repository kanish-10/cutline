import type { Board, Card, SessionUser, Stage } from "@cutline/shared";
import {
  APP,
  ApiError,
  CREATOR_TYPES,
  createBoardSchema,
  createCardSchema,
  LIMITS,
  QUERY_KEYS,
  TEMPLATES,
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
import {
  AppState,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import type { UndoMove } from "./board-state";
import { replaceCard, undoInput } from "./board-state";
import { CardDetail } from "./card-detail";
import { useClients } from "./clients";
import { StageEditor } from "./stage-editor";
import {
  Button,
  confirmDiscard,
  ErrorNotice,
  Field,
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
  const { width } = useWindowDimensions();
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

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" style={styles.heading}>
            {APP.name}
          </Text>
          <Text style={styles.muted}>{user.name}</Text>
        </View>
        <Button
          title="Sign out"
          disabled={action.pending}
          onPress={() =>
            confirmDiscard(Boolean(capture), () => {
              void action.run(async () => {
                const result = await authClient.signOut();
                await client.cancelQueries();
                client.clear();
                recheckSession();
                if (result.error)
                  throw new Error(result.error.message ?? "Sign out failed.");
              });
            })
          }
        />
      </View>
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
        <Loading label="Opening your board…" />
      ) : board === null ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text accessibilityRole="header" style={styles.hero}>
            What do you make?
          </Text>
          <Text style={styles.muted}>
            Start with a template. Every stage is yours to customize.
          </Text>
          {CREATOR_TYPES.map((creatorType) => (
            <View key={creatorType} style={styles.card}>
              <Button
                primary
                title={
                  creatorType.charAt(0).toUpperCase() + creatorType.slice(1)
                }
                disabled={action.pending}
                onPress={() => {
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
              <Text style={styles.muted}>
                {TEMPLATES[creatorType].join(" → ")}
              </Text>
            </View>
          ))}
          {action.pending && <Loading label="Creating your board…" />}
        </ScrollView>
      ) : board ? (
        <>
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
              {query.isFetching ? "Syncing…" : "Swipe across stages"}
            </Text>
          </View>
          <ScrollView
            horizontal
            style={styles.flex}
            contentContainerStyle={local.columns}
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator
          >
            {stages.map((stage, index) => {
              const cards = board.cards.filter(
                (card) =>
                  card.stageId === stage.id && card.archived === archive,
              );
              const next = stages[index + 1];
              return (
                <View
                  key={stage.id}
                  style={[
                    local.column,
                    {
                      width: Math.min(360, width - 40),
                      borderTopColor: stage.color,
                    },
                  ]}
                >
                  <View style={local.stageHeading}>
                    <Text
                      accessibilityRole="header"
                      style={[styles.label, styles.flex]}
                    >
                      {stage.name} · {cards.length}
                    </Text>
                    <Button
                      title="Edit"
                      label={`Edit stage ${stage.name}`}
                      disabled={action.pending}
                      onPress={() => setEditingStage(stage)}
                    />
                  </View>
                  <FlatList
                    data={cards}
                    keyExtractor={(card) => card.id}
                    contentContainerStyle={local.cards}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                      <Text style={styles.muted}>
                        {archive
                          ? "Nothing archived here."
                          : "Room for your next idea."}
                      </Text>
                    }
                    renderItem={({ item: card }) => (
                      <View style={styles.card}>
                        <Button
                          title={card.title}
                          label={`Open details for ${card.title}`}
                          disabled={action.pending}
                          onPress={() => setSelected(card)}
                        />
                        {card.notes ? (
                          <Text numberOfLines={2} style={styles.muted}>
                            {card.notes}
                          </Text>
                        ) : null}
                        {card.tags.length > 0 && (
                          <Text style={styles.muted}>
                            {card.tags.join(" · ")}
                          </Text>
                        )}
                        <Text style={styles.muted}>
                          {card.checklist.filter((item) => item.done).length}/
                          {card.checklist.length} steps
                        </Text>
                        {!archive && next ? (
                          <Button
                            title={`Advance to ${next.name}`}
                            disabled={action.pending}
                            onPress={() => advance(card, next)}
                          />
                        ) : (
                          <Text style={styles.muted}>
                            {archive ? "Archived" : "Final stage"}
                          </Text>
                        )}
                      </View>
                    )}
                  />
                </View>
              );
            })}
            <View style={local.addStage}>
              <Button
                title="Add stage"
                disabled={action.pending || stages.length >= LIMITS.stages}
                onPress={() => setEditingStage("new")}
              />
              {stages.length >= LIMITS.stages && (
                <Text style={styles.muted}>Stage limit reached.</Text>
              )}
            </View>
          </ScrollView>
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
            <View style={local.capture}>
              <Field
                label={`Capture into ${stages[0]?.name ?? "your board"}`}
                value={capture}
                onChangeText={setCapture}
                maxLength={LIMITS.title}
                editable={!action.pending}
                placeholder="A title is enough…"
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (capture.trim() && board.cards.length < LIMITS.cards)
                    captureIdea();
                }}
              />
              <Button
                primary
                title={action.pending ? "Working…" : "Capture idea"}
                disabled={
                  action.pending ||
                  !capture.trim() ||
                  board.cards.length >= LIMITS.cards
                }
                onPress={captureIdea}
              />
              {board.cards.length >= LIMITS.cards && (
                <Text style={styles.muted}>
                  Your board has reached its {LIMITS.cards}-card limit.
                </Text>
              )}
            </View>
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
      ) : null}
    </Screen>
  );
}

const local = StyleSheet.create({
  notices: { paddingHorizontal: 20 },
  columns: { padding: 20, gap: 16 },
  column: { borderTopWidth: 4, borderRadius: 10, gap: 12 },
  stageHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingTop: 8,
  },
  cards: { gap: 12, paddingBottom: 20 },
  addStage: { width: 160, paddingTop: 12, gap: 10 },
  capture: { paddingHorizontal: 20, paddingBottom: 10, gap: 8 },
  notice: { paddingHorizontal: 20, paddingVertical: 4, ...styles.muted },
  undo: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
});
