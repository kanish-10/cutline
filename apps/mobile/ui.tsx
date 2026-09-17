import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { TextInputProps } from "react-native";
import {
  AccessibilityInfo,
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
import { LAYOUT, RADIUS, SPACE, THEME, TYPE } from "./constants";
import { errorMessage } from "./form-errors";

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

export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        changed = true;
        setReduced(value);
      },
    );
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active && !changed) setReduced(value);
      })
      .catch(() => {});
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
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
        pressed && styles.pressed,
        disabled && styles.dim,
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
  error,
  ...props
}: TextInputProps & { label: string; error?: string | undefined }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={error}
        placeholderTextColor={THEME.muted}
        selectionColor={THEME.accent}
        {...props}
        onFocus={(event) => {
          setFocused(true);
          props.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          props.onBlur?.(event);
        }}
        style={[
          styles.input,
          props.multiline && styles.multiline,
          focused && styles.focused,
          Boolean(error) && styles.invalid,
          style,
        ]}
      />
      {error && (
        <Text accessibilityLiveRegion="polite" style={styles.fieldError}>
          {error}
        </Text>
      )}
    </View>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={styles.error}
    >
      {errorMessage(error)}
    </Text>
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  const reduced = useReducedMotion();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite">
      {!reduced && (
        <ActivityIndicator color={THEME.accent} accessibilityLabel={label} />
      )}
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
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  pending: boolean;
  footer?: ReactNode;
}) {
  const reduced = useReducedMotion();
  return (
    <Modal
      visible
      animationType={reduced ? "none" : "slide"}
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
              style={styles.flex}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              contentContainerStyle={[styles.content, styles.form]}
            >
              {children}
            </ScrollView>
            {footer && (
              <View style={styles.footer}>
                <View style={[styles.form, styles.footerContent]}>
                  {footer}
                </View>
              </View>
            )}
          </View>
        </Screen>
      </SafeAreaProvider>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { flex: 1, backgroundColor: THEME.paper },
  content: { padding: SPACE.xl, gap: SPACE.lg, paddingBottom: SPACE.hero },
  form: { width: "100%", maxWidth: LAYOUT.form, alignSelf: "center" },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: SPACE.xxl,
    gap: SPACE.lg,
  },
  header: {
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACE.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: SPACE.sm,
  },
  inline: { flexDirection: "row", alignItems: "center", gap: SPACE.sm },
  heading: {
    fontSize: TYPE.title,
    fontWeight: "700",
    color: THEME.ink,
    flexShrink: 1,
    letterSpacing: -0.5,
  },
  hero: {
    fontSize: TYPE.hero,
    fontWeight: "700",
    color: THEME.ink,
    letterSpacing: -1.2,
  },
  eyebrow: {
    fontSize: TYPE.caption,
    fontWeight: "700",
    color: THEME.muted,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  label: { color: THEME.ink, fontSize: TYPE.small, fontWeight: "600" },
  text: { color: THEME.ink, fontSize: TYPE.body, lineHeight: 24 },
  muted: { color: THEME.muted, fontSize: TYPE.small, lineHeight: 21 },
  field: { gap: SPACE.sm },
  input: {
    borderWidth: 1,
    borderColor: THEME.line,
    backgroundColor: THEME.surface,
    borderRadius: RADIUS.control,
    padding: SPACE.md,
    fontSize: TYPE.body,
    color: THEME.ink,
    minHeight: LAYOUT.touch,
  },
  focused: { borderColor: THEME.accent },
  invalid: { borderColor: THEME.danger },
  multiline: { minHeight: LAYOUT.notes, textAlignVertical: "top" },
  button: {
    minHeight: LAYOUT.touch,
    minWidth: LAYOUT.touch,
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.control,
    borderWidth: 1,
    borderColor: THEME.line,
    backgroundColor: THEME.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    fontSize: TYPE.small,
    fontWeight: "600",
    color: THEME.ink,
    textAlign: "center",
  },
  primary: { backgroundColor: THEME.accent, borderColor: THEME.accent },
  primaryText: { color: THEME.surface },
  selected: { borderColor: THEME.accent, backgroundColor: THEME.accentSoft },
  pressed: { opacity: 0.7 },
  dim: { opacity: 0.45 },
  danger: { color: THEME.danger },
  fieldError: { color: THEME.danger, fontSize: TYPE.small, lineHeight: 21 },
  error: {
    color: THEME.danger,
    fontSize: TYPE.small,
    lineHeight: 21,
    padding: SPACE.md,
    backgroundColor: THEME.dangerSoft,
    borderRadius: RADIUS.small,
  },
  card: {
    padding: SPACE.lg,
    borderRadius: RADIUS.card,
    backgroundColor: THEME.surface,
    borderColor: THEME.line,
    borderWidth: 1,
    gap: SPACE.md,
  },
  divider: { height: 1, backgroundColor: THEME.line, marginVertical: SPACE.sm },
  footer: {
    backgroundColor: THEME.paper,
    borderTopColor: THEME.line,
    borderTopWidth: 1,
  },
  footerContent: {
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.md,
    gap: SPACE.sm,
  },
});
