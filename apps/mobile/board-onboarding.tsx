import { CREATOR_TYPES, type CreatorType, TEMPLATES } from "@cutline/shared";
import { ScrollView, Text, View } from "react-native";
import { CREATOR_OPTIONS } from "./constants";
import { Button, styles } from "./ui";

export function BoardOnboarding({
  pending,
  onChoose,
}: {
  pending: boolean;
  onChoose: (type: CreatorType) => void;
}) {
  return (
    <ScrollView contentContainerStyle={[styles.content, styles.form]}>
      <Text style={styles.eyebrow}>A starting point, not a rulebook</Text>
      <Text accessibilityRole="header" style={styles.hero}>
        What do you make?
      </Text>
      <Text style={styles.muted}>
        Choose your starting stages. You can change every one of them later.
      </Text>
      {CREATOR_TYPES.map((type, index) => (
        <View key={type} style={styles.card}>
          <Text style={styles.eyebrow}>
            0{index + 1} / {CREATOR_OPTIONS[type].label}
          </Text>
          <Text style={styles.text}>{CREATOR_OPTIONS[type].description}</Text>
          <Text style={styles.muted}>{TEMPLATES[type].join(" → ")}</Text>
          <Button
            title={`Start with ${CREATOR_OPTIONS[type].label.toLowerCase()}`}
            disabled={pending}
            onPress={() => onChoose(type)}
          />
        </View>
      ))}
      {pending && (
        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          Creating your workspace…
        </Text>
      )}
    </ScrollView>
  );
}
