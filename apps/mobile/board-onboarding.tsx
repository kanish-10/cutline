import {
  CREATOR_TYPES,
  type CreateBoard,
  LIMITS,
  TEMPLATES,
} from "@cutline/shared";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { CREATOR_OPTIONS } from "./constants";
import { Button, Field, styles } from "./ui";

export function BoardOnboarding({
  pending,
  onChoose,
}: {
  pending: boolean;
  onChoose: (input: CreateBoard) => void;
}) {
  const [name, setName] = useState("");
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, styles.form]}
    >
      <Text style={styles.eyebrow}>A starting point, not a rulebook</Text>
      <Text accessibilityRole="header" style={styles.hero}>
        What do you make?
      </Text>
      <Field
        label="Board name"
        value={name}
        onChangeText={setName}
        maxLength={LIMITS.name}
        editable={!pending}
        placeholder="My board"
      />
      <Text style={styles.muted}>
        Name your board and choose your starting stages. You can change every
        stage later.
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
            disabled={pending || !name.trim()}
            onPress={() => onChoose({ name: name.trim(), creatorType: type })}
          />
        </View>
      ))}
      {pending && (
        <Text accessibilityLiveRegion="polite" style={styles.muted}>
          Creating your board…
        </Text>
      )}
    </ScrollView>
  );
}
