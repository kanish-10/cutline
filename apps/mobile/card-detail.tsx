import type { Card, Stage } from "@cutline/shared";
import {
  ApiError,
  CHECKLISTS,
  LIMITS,
  safeUrlSchema,
  updateCardSchema,
} from "@cutline/shared";
import { randomUUID } from "expo-crypto";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Switch, Text, View } from "react-native";
import { cardChanges, draftOf, parseList } from "./card-draft";
import { ChecklistRow } from "./checklist-row";
import { useClients } from "./clients";
import { THEME } from "./constants";
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

export function CardDetail({
  card,
  latest,
  stages,
  onClose,
  onSaved,
  refresh,
}: {
  card: Card;
  latest: Card | undefined;
  stages: Stage[];
  onClose: () => void;
  onSaved: (card: Card) => Promise<void>;
  refresh: () => Promise<unknown>;
}) {
  const { api } = useClients();
  const [base, setBase] = useState(card);
  const [draft, setDraft] = useState(() => draftOf(card));
  const [newStep, setNewStep] = useState("");
  const action = useAction();
  const errors = fieldErrors(action.error);
  const dirty =
    JSON.stringify(draft) !== JSON.stringify(draftOf(base)) || Boolean(newStep);
  const conflict =
    latest?.version !== base.version ||
    (action.error instanceof ApiError && action.error.status === 409);
  const unavailable = !latest;
  const disabled = action.pending || unavailable;
  function set<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
  function close() {
    if (!action.pending) confirmDiscard(dirty, onClose);
  }
  const selectedStage = stages.find((stage) => stage.id === draft.stageId);
  const template = CHECKLISTS[selectedStage?.name ?? ""];

  function save() {
    void action.run(async () => {
      if (conflict || unavailable)
        throw new Error("Load the latest saved card before saving.");
      if (newStep.trim())
        throw new Error(
          "Add your pending checklist step or clear it before saving.",
        );
      const input = cardChanges(base, draft);
      if (!stages.some((stage) => stage.id === draft.stageId))
        throw new Error("Choose an available stage.");
      try {
        const result = await api.updateCard(
          base.id,
          updateCardSchema.parse(input),
        );
        await onSaved(result);
        onClose();
      } catch (error) {
        void refresh();
        throw error;
      }
    });
  }

  return (
    <Sheet
      title="Idea details"
      onClose={close}
      pending={action.pending}
      footer={
        <>
          <Text accessibilityLiveRegion="polite" style={styles.muted}>
            {action.pending
              ? "Saving your changes…"
              : unavailable
                ? "Card unavailable · edits not saved"
                : conflict
                  ? "Changed elsewhere · review saved copy above"
                  : dirty
                    ? "Unsaved changes · save when you’re ready"
                    : "You’re up to date"}
          </Text>
          <ErrorNotice error={action.error} />
          <Button
            primary
            title={action.pending ? "Saving…" : "Save changes"}
            disabled={disabled || conflict || !dirty}
            onPress={save}
          />
        </>
      }
    >
      {unavailable && (
        <ErrorNotice error="This card is no longer available. Close this screen and refresh your board." />
      )}
      {conflict && latest && (
        <View style={styles.card}>
          <ErrorNotice error="This card changed elsewhere. Your edits are still here; review the saved copy before discarding them to reload." />
          <Text style={styles.label}>Latest saved card: {latest.title}</Text>
          <Text style={styles.text}>{latest.notes || "No notes"}</Text>
          <Text style={styles.muted}>
            Stage:{" "}
            {stages.find((stage) => stage.id === latest.stageId)?.name ??
              "Unavailable"}{" "}
            · {latest.archived ? "Archived" : "Active"}
          </Text>
          <Text style={styles.muted}>
            Tags: {latest.tags.join(", ") || "None"}
            {"\n"}Links: {latest.links.join("\n") || "None"}
          </Text>
          {latest.checklist.map((item) => (
            <Text key={item.id} style={styles.muted}>
              {item.done ? "Done" : "To do"}: {item.text}
            </Text>
          ))}
          <Button
            title="Load saved copy"
            disabled={action.pending}
            onPress={() =>
              confirmDiscard(dirty, () => {
                setBase(latest);
                setDraft(draftOf(latest));
                setNewStep("");
                action.clearError();
              })
            }
          />
        </View>
      )}
      <Field
        label="Title"
        error={errors.title}
        value={draft.title}
        onChangeText={(value) => set("title", value)}
        maxLength={LIMITS.title}
        editable={!disabled}
      />
      <Field
        label="Notes"
        error={errors.notes}
        multiline
        value={draft.notes}
        onChangeText={(value) => set("notes", value)}
        maxLength={LIMITS.notes}
        editable={!disabled}
      />
      <Text style={styles.label}>Stage</Text>
      <View style={styles.row}>
        {stages.map((stage) => (
          <Button
            key={stage.id}
            title={stage.name}
            selected={draft.stageId === stage.id}
            disabled={disabled}
            onPress={() => set("stageId", stage.id)}
          />
        ))}
      </View>
      <Text accessibilityRole="header" style={styles.heading}>
        Checklist
      </Text>
      {draft.checklist.length === 0 && (
        <Text style={styles.muted}>
          No steps yet. Add your own or use a stage checklist.
        </Text>
      )}
      <Text style={styles.muted}>
        {draft.checklist.filter((item) => item.done).length} of{" "}
        {draft.checklist.length} complete
      </Text>
      <ErrorNotice error={errors.checklist} />
      <View style={styles.field}>
        {draft.checklist.map((item, index) => (
          <ChecklistRow
            key={item.id}
            item={item}
            index={index}
            disabled={disabled}
            onChange={(updated) =>
              set(
                "checklist",
                draft.checklist.map((entry) =>
                  entry.id === item.id ? updated : entry,
                ),
              )
            }
            onRemove={() =>
              set(
                "checklist",
                draft.checklist.filter((entry) => entry.id !== item.id),
              )
            }
          />
        ))}
      </View>
      <Field
        label="New checklist step"
        value={newStep}
        onChangeText={setNewStep}
        maxLength={LIMITS.checklistText}
        editable={!disabled && draft.checklist.length < LIMITS.checklist}
      />
      <Button
        title="Add step"
        disabled={
          disabled ||
          !newStep.trim() ||
          draft.checklist.length >= LIMITS.checklist
        }
        onPress={() => {
          set("checklist", [
            ...draft.checklist,
            { id: randomUUID(), text: newStep.trim(), done: false },
          ]);
          setNewStep("");
        }}
      />
      {template && draft.checklist.length === 0 && (
        <Button
          title={`Use ${selectedStage?.name} checklist`}
          disabled={disabled}
          onPress={() =>
            set(
              "checklist",
              template.map((text) => ({ id: randomUUID(), text, done: false })),
            )
          }
        />
      )}
      <Field
        label={`Tags, separated by commas (up to ${LIMITS.tags})`}
        error={errors.tags}
        value={draft.tags}
        onChangeText={(value) => set("tags", value)}
        editable={!disabled}
        maxLength={(LIMITS.tag + 2) * LIMITS.tags}
        autoCapitalize="none"
      />
      <Field
        label={`Links, one http(s) URL per line (up to ${LIMITS.links})`}
        error={errors.links}
        multiline
        value={draft.links}
        onChangeText={(value) => set("links", value)}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={(LIMITS.url + 1) * LIMITS.links}
      />
      {parseList(draft.links, "\n").map((link) => (
        <Button
          key={link}
          title={`Open ${link}`}
          disabled={disabled || !safeUrlSchema.safeParse(link).success}
          onPress={() => {
            void action.run(() => Linking.openURL(safeUrlSchema.parse(link)));
          }}
        />
      ))}
      <View style={styles.row}>
        <Switch
          accessibilityLabel="Archived"
          trackColor={{ false: THEME.line, true: THEME.accent }}
          value={draft.archived}
          onValueChange={(value) => set("archived", value)}
          disabled={disabled}
        />
        <Text style={styles.label}>
          {draft.archived
            ? "Archived — switch off to restore"
            : "Archive this idea"}
        </Text>
      </View>
      <Text style={styles.muted}>
        Changes, including archive and restore, apply when you save.
      </Text>
    </Sheet>
  );
}
