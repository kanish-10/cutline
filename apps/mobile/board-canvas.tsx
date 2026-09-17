import type { Board, Card, Stage } from "@cutline/shared";
import { LIMITS } from "@cutline/shared";
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { LAYOUT, RADIUS, SPACE, THEME, TYPE } from "./constants";
import { Button, styles, useReducedMotion } from "./ui";

function IdeaCard({
  card,
  next,
  pending,
  onOpen,
  onAdvance,
}: {
  card: Card;
  next: Stage | undefined;
  pending: boolean;
  onOpen: () => void;
  onAdvance: () => void;
}) {
  const done = card.checklist.filter((item) => item.done).length;
  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open details for ${card.title}`}
        accessibilityState={{ disabled: pending }}
        disabled={pending}
        onPress={onOpen}
        style={({ pressed }) => [local.cardBody, pressed && styles.pressed]}
      >
        <Text style={local.cardTitle}>{card.title}</Text>
        {card.notes ? (
          <Text numberOfLines={2} style={styles.muted}>
            {card.notes}
          </Text>
        ) : null}
        {card.tags.length > 0 && (
          <View style={styles.row}>
            {card.tags.slice(0, LAYOUT.tagPreview).map((tag) => (
              <Text key={tag} style={local.tag}>
                {tag}
              </Text>
            ))}
            {card.tags.length > LAYOUT.tagPreview && (
              <Text style={styles.muted}>
                +{card.tags.length - LAYOUT.tagPreview}
              </Text>
            )}
          </View>
        )}
        {card.checklist.length > 0 && (
          <Text style={styles.muted}>
            {done === card.checklist.length
              ? "Checklist complete"
              : `${done} of ${card.checklist.length} steps`}
          </Text>
        )}
      </Pressable>
      {!card.archived && next ? (
        <Button
          title={`Move to ${next.name} →`}
          disabled={pending}
          onPress={onAdvance}
        />
      ) : (
        <Text style={styles.eyebrow}>
          {card.archived ? "Archived · open to restore" : "Final stage"}
        </Text>
      )}
    </View>
  );
}

export function BoardCanvas({
  board,
  stages,
  archive,
  pending,
  onOpen,
  onAdvance,
  onEditStage,
  onAddStage,
}: {
  board: Board;
  stages: Stage[];
  archive: boolean;
  pending: boolean;
  onOpen: (card: Card) => void;
  onAdvance: (card: Card, next: Stage) => void;
  onEditStage: (stage: Stage) => void;
  onAddStage: () => void;
}) {
  const { width } = useWindowDimensions();
  const reduced = useReducedMotion();
  const columnWidth = Math.min(
    LAYOUT.column,
    Math.max(LAYOUT.touch, width - SPACE.xl * 2),
  );
  return (
    <ScrollView
      horizontal
      style={styles.flex}
      contentContainerStyle={local.columns}
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator
      snapToInterval={reduced ? undefined : columnWidth + SPACE.lg}
      decelerationRate={reduced ? "normal" : "fast"}
      overScrollMode="never"
    >
      {stages.map((stage, index) => {
        const cards = board.cards.filter(
          (card) => card.stageId === stage.id && card.archived === archive,
        );
        const next = stages[index + 1];
        return (
          <View key={stage.id} style={[local.column, { width: columnWidth }]}>
            <View style={local.stageHeading}>
              <View style={[local.dot, { backgroundColor: stage.color }]} />
              <Text
                accessibilityRole="header"
                style={[styles.label, styles.flex]}
              >
                {stage.name} <Text style={styles.muted}> {cards.length}</Text>
              </Text>
              <Button
                title="Edit"
                label={`Edit stage ${stage.name}`}
                disabled={pending}
                onPress={() => onEditStage(stage)}
              />
            </View>
            <FlatList
              data={cards}
              keyExtractor={(card) => card.id}
              style={styles.flex}
              contentContainerStyle={local.cards}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={local.empty}>
                  <Text style={styles.label}>
                    {archive
                      ? "Nothing archived here"
                      : index === 0
                        ? "Start with a spark"
                        : "Space for what’s next"}
                  </Text>
                  <Text style={styles.muted}>
                    {archive
                      ? "Archived ideas stay safe until you need them."
                      : index === 0
                        ? "Capture a title below. The rest can come later."
                        : "Move an idea here when you’re ready."}
                  </Text>
                </View>
              }
              renderItem={({ item }) => (
                <IdeaCard
                  card={item}
                  next={next}
                  pending={pending}
                  onOpen={() => onOpen(item)}
                  onAdvance={() => {
                    if (next) onAdvance(item, next);
                  }}
                />
              )}
            />
          </View>
        );
      })}
      <View style={local.addStage}>
        <Button
          title="+ Add stage"
          disabled={pending || stages.length >= LIMITS.stages}
          onPress={onAddStage}
        />
        <Text style={styles.muted}>
          {stages.length >= LIMITS.stages
            ? "Stage limit reached."
            : "Make this process your own."}
        </Text>
      </View>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  columns: { padding: SPACE.lg, gap: SPACE.lg },
  column: {
    backgroundColor: THEME.soft,
    borderRadius: RADIUS.card,
    padding: SPACE.sm,
    gap: SPACE.sm,
  },
  stageHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.sm,
    paddingLeft: SPACE.sm,
  },
  dot: { width: SPACE.sm, height: SPACE.sm, borderRadius: RADIUS.pill },
  cards: { gap: SPACE.md, paddingBottom: SPACE.md },
  cardBody: { minHeight: LAYOUT.touch, gap: SPACE.sm },
  cardTitle: {
    fontSize: TYPE.body,
    fontWeight: "600",
    lineHeight: 24,
    color: THEME.ink,
  },
  tag: {
    fontSize: TYPE.caption,
    color: THEME.muted,
    backgroundColor: THEME.paper,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
    borderRadius: RADIUS.small,
    overflow: "hidden",
  },
  empty: {
    padding: SPACE.lg,
    paddingVertical: SPACE.hero,
    borderWidth: 1,
    borderColor: THEME.line,
    borderStyle: "dashed",
    borderRadius: RADIUS.control,
    gap: SPACE.sm,
  },
  addStage: { width: 160, paddingTop: SPACE.sm, gap: SPACE.md },
});
