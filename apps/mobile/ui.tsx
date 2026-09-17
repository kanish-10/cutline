import { COLORS } from "@cutline/shared";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import type { TextInputProps } from "react-native";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export function useAction() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function run(action: () => Promise<unknown>) {
    if (lock.current) return false;
    lock.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (error) {
      setError(error);
      return false;
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return { pending, error, run, clearError: () => setError(null) };
}

export function confirmDiscard(dirty: boolean, onConfirm: () => void) {
  if (!dirty) return onConfirm();
  Alert.alert("Discard unsaved changes?", "Your changes have not been saved.", [
    { text: "Keep editing", style: "cancel" },
    { text: "Discard", style: "destructive", onPress: onConfirm },
  ]);
}

export function Button({
  title,
  onPress,
  disabled = false,
  primary = false,
  danger = false,
  selected = false,
  label,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  selected?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        selected && styles.selected,
        (disabled || pressed) && styles.dim,
      ]}
    >
      <Text
        style={[
          styles.buttonText,
          primary && styles.primaryText,
          danger && styles.danger,
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  style,
  ...props
}: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={COLORS.muted}
        {...props}
        style={[styles.input, props.multiline && styles.multiline, style]}
      />
    </View>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Something went wrong. Please try again.";
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={styles.error}
    >
      {message}
    </Text>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={COLORS.accent} accessibilityLabel={label} />
      <Text style={styles.muted}>{label}</Text>
    </View>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Sheet({
  title,
  children,
  onClose,
  pending,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  pending: boolean;
}) {
  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        if (!pending) onClose();
      }}
    >
      <SafeAreaProvider>
        <Screen>
          <View accessibilityViewIsModal style={styles.flex}>
            <View style={styles.header}>
              <Text accessibilityRole="header" style={styles.heading}>
                {title}
              </Text>
              <Button title="Close" onPress={onClose} disabled={pending} />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.content}
            >
              {children}
            </ScrollView>
          </View>
        </Screen>
      </SafeAreaProvider>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: COLORS.paper },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  heading: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.ink,
    flexShrink: 1,
  },
  hero: { fontSize: 36, fontWeight: "700", color: COLORS.ink },
  label: { color: COLORS.ink, fontSize: 16, fontWeight: "600" },
  text: { color: COLORS.ink, fontSize: 16, lineHeight: 23 },
  muted: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  field: { gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: COLORS.ink,
    minHeight: 48,
  },
  multiline: { minHeight: 100, textAlignVertical: "top" },
  button: {
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.line,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 15, fontWeight: "600", color: COLORS.ink },
  primary: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  primaryText: { color: COLORS.surface },
  selected: { borderColor: COLORS.accent, borderWidth: 2 },
  dim: { opacity: 0.5 },
  danger: { color: COLORS.danger },
  error: { color: COLORS.danger, fontSize: 15, paddingVertical: 8 },
  card: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    borderColor: COLORS.line,
    borderWidth: 1,
    gap: 12,
  },
  divider: { height: 1, backgroundColor: COLORS.line, marginVertical: 8 },
});
