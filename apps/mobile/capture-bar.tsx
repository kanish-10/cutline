import { LIMITS } from "@cutline/shared";
import { Text, View } from "react-native";
import { Button, Field, styles } from "./ui";

export function CaptureBar({
  value,
  onChange,
  onCapture,
  pending,
  full,
  stage,
}: {
  value: string;
  onChange: (value: string) => void;
  onCapture: () => void;
  pending: boolean;
  full: boolean;
  stage: string;
}) {
  const disabled = pending || full || !value.trim();
  return (
    <View style={styles.footer}>
      <View style={[styles.form, styles.footerContent]}>
        <Text style={styles.eyebrow}>Quick capture · {stage}</Text>
        <View style={styles.inline}>
          <View style={styles.flex}>
            <Field
              label="What’s the idea?"
              value={value}
              onChangeText={onChange}
              maxLength={LIMITS.title}
              editable={!pending && !full}
              placeholder="A title is enough…"
              returnKeyType="done"
              onSubmitEditing={() => {
                if (!disabled) onCapture();
              }}
            />
          </View>
          <Button
            primary
            title={pending ? "Wait…" : "+ Add"}
            label={`Capture idea into ${stage}`}
            disabled={disabled}
            onPress={onCapture}
          />
        </View>
        {full && (
          <Text style={styles.muted}>
            Your board has reached its {LIMITS.cards}-active-card limit. Archive
            an idea to make room.
          </Text>
        )}
      </View>
    </View>
  );
}
