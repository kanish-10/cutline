import type { ChecklistItem } from "@cutline/shared";
import { LIMITS } from "@cutline/shared";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LAYOUT, RADIUS, SPACE, THEME, TYPE } from "./constants";
import { Button, styles } from "./ui";

export function ChecklistRow({
  item,
  index,
  disabled,
  onChange,
  onRemove,
}: {
  item: ChecklistItem;
  index: number;
  disabled: boolean;
  onChange: (item: ChecklistItem) => void;
  onRemove: () => void;
}) {
  return (
    <View style={local.row}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityLabel={`Complete step ${index + 1}: ${item.text}`}
        accessibilityState={{ checked: item.done, disabled }}
        disabled={disabled}
        onPress={() => onChange({ ...item, done: !item.done })}
        style={({ pressed }) => [
          local.toggle,
          pressed && styles.pressed,
          disabled && styles.dim,
        ]}
      >
        <View style={[local.box, item.done && local.checked]}>
          <Text style={local.mark}>{item.done ? "✓" : ""}</Text>
        </View>
      </Pressable>
      <TextInput
        accessibilityLabel={`Step ${index + 1}`}
        value={item.text}
        maxLength={LIMITS.checklistText}
        editable={!disabled}
        multiline
        selectionColor={THEME.accent}
        placeholder="Describe this step"
        placeholderTextColor={THEME.muted}
        onChangeText={(text) => onChange({ ...item, text })}
        style={[local.input, item.done && local.done]}
      />
      <Button
        title="×"
        label={`Remove step ${index + 1}`}
        danger
        disabled={disabled}
        onPress={onRemove}
      />
    </View>
  );
}

const local = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACE.xs,
    backgroundColor: THEME.surface,
    borderWidth: 1,
    borderColor: THEME.line,
    borderRadius: RADIUS.control,
    paddingRight: SPACE.xs,
  },
  toggle: {
    minWidth: LAYOUT.touch,
    minHeight: LAYOUT.touch,
    alignItems: "center",
    justifyContent: "center",
  },
  box: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderColor: THEME.muted,
    borderRadius: RADIUS.small,
    alignItems: "center",
    justifyContent: "center",
  },
  checked: { backgroundColor: THEME.success, borderColor: THEME.success },
  mark: { color: THEME.surface, fontSize: TYPE.body, fontWeight: "700" },
  input: {
    flex: 1,
    minHeight: LAYOUT.touch,
    paddingVertical: SPACE.md,
    color: THEME.ink,
    fontSize: TYPE.body,
  },
  done: { textDecorationLine: "line-through", color: THEME.muted },
});
