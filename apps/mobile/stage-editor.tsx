import type { Board, Stage } from "@cutline/shared";
import {
  createStageSchema,
  LIMITS,
  QUERY_KEYS,
  STAGE_COLORS,
  updateStageSchema,
} from "@cutline/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { useClients } from "./clients";
import { RADIUS } from "./constants";
import { fieldErrors } from "./form-errors";
import {
  Button,
  confirmDiscard,
  ErrorNotice,
  Field,
  Sheet,
  styles,
  useAction,
} from "./ui";

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
  const action = useAction();
  const dirty = name !== (stage?.name ?? "") || color !== initialColor;
  const stages = [...board.stages].sort((a, b) => a.position - b.position);
  const position = stages.findIndex((item) => item.id === stage?.id);
  const missing = Boolean(stage && position < 0);
  const cardCount = board.cards.filter(
    (card) => card.stageId === stage?.id,
  ).length;
  const disabled = action.pending || missing;
  function execute(operation: () => Promise<unknown>) {
    void action.run(async () => {
      try {
        await operation();
        await client.invalidateQueries({ queryKey: QUERY_KEYS.board });
        onClose();
      } catch (error) {
        void client.invalidateQueries({ queryKey: QUERY_KEYS.board });
        throw error;
      }
    });
  }
  return (
    <Sheet
      title={stage ? "Edit stage" : "Add stage"}
      pending={action.pending}
      onClose={() => {
        if (!action.pending) confirmDiscard(dirty, onClose);
      }}
    >
      {missing && (
        <ErrorNotice error="This stage was deleted elsewhere. Close this screen to continue." />
      )}
      <Field
        label="Stage name"
        error={fieldErrors(action.error).name}
        value={name}
        onChangeText={setName}
        maxLength={LIMITS.stageName}
        editable={!disabled}
      />
      <Text style={styles.label}>Stage color</Text>
      <View style={styles.row}>
        {STAGE_COLORS.map((value, index) => (
          <View
            key={value}
            style={{
              borderTopColor: value,
              borderTopWidth: 6,
              borderRadius: RADIUS.control,
            }}
          >
            <Button
              title={`Color ${index + 1}`}
              label={`Stage color ${index + 1}, ${value}`}
              selected={color === value}
              disabled={disabled}
              onPress={() => setColor(value)}
            />
          </View>
        ))}
      </View>
      <ErrorNotice error={action.error} />
      <Button
        primary
        title={action.pending ? "Working…" : stage ? "Save stage" : "Add stage"}
        disabled={
          disabled ||
          !name.trim() ||
          (Boolean(stage) && !dirty) ||
          (!stage && stages.length >= LIMITS.stages)
        }
        onPress={() =>
          execute(async () => {
            const input = createStageSchema.parse({ name, color });
            return stage
              ? api.updateStage(stage.id, updateStageSchema.parse(input))
              : api.createStage(input);
          })
        }
      />
      {stage && (
        <>
          <View style={styles.divider} />
          <Text accessibilityRole="header" style={styles.heading}>
            Stage order
          </Text>
          <Text style={styles.muted}>
            Stage {position + 1} of {stages.length}. Reordering changes where
            cards advance next. Save name or color edits first.
          </Text>
          <View style={styles.row}>
            <Button
              title="Move left"
              disabled={disabled || dirty || position <= 0}
              onPress={() =>
                execute(() =>
                  api.updateStage(
                    stage.id,
                    updateStageSchema.parse({ direction: "left" }),
                  ),
                )
              }
            />
            <Button
              title="Move right"
              disabled={disabled || dirty || position >= stages.length - 1}
              onPress={() =>
                execute(() =>
                  api.updateStage(
                    stage.id,
                    updateStageSchema.parse({ direction: "right" }),
                  ),
                )
              }
            />
          </View>
          <View style={styles.divider} />
          <Text style={styles.muted}>
            {cardCount
              ? `Move all ${cardCount} cards out first, including archived cards.`
              : stages.length <= 1
                ? "Keep at least one stage."
                : "This empty stage can be deleted."}
          </Text>
          <Button
            title="Delete empty stage"
            danger
            disabled={disabled || cardCount > 0 || stages.length <= 1}
            onPress={() =>
              Alert.alert(
                `Delete ${stage.name}?`,
                "This cannot be undone. Any unsaved stage edits will be discarded.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete stage",
                    style: "destructive",
                    onPress: () => execute(() => api.deleteStage(stage.id)),
                  },
                ],
              )
            }
          />
        </>
      )}
    </Sheet>
  );
}
