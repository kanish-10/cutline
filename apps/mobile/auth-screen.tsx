import { APP, credentialsSchema, LIMITS, signupSchema } from "@cutline/shared";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useClients } from "./clients";
import { fieldErrors } from "./form-errors";
import { Button, ErrorNotice, Field, Screen, styles, useAction } from "./ui";

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: () => void;
}) {
  const { authClient } = useClients();
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const action = useAction();
  const errors = fieldErrors(action.error);
  function submit() {
    void action.run(async () => {
      const input = { email: email.trim(), password };
      const result = signup
        ? await authClient.signUp.email(signupSchema.parse({ ...input, name }))
        : await authClient.signIn.email(credentialsSchema.parse(input));
      if (result.error)
        throw new Error(result.error.message ?? "Authentication failed.");
      setPassword("");
      onAuthenticated();
    });
  }
  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, styles.form]}
      >
        <Text accessibilityRole="header" style={styles.heading}>
          {APP.name}
        </Text>
        <Text style={styles.hero}>Less managing.{"\n"}More making.</Text>
        <Text style={styles.muted}>
          One quiet place to take your ideas from what if to published.
        </Text>
        <View style={styles.divider} />
        <Text style={styles.eyebrow}>Your creative workspace</Text>
        <Text accessibilityRole="header" style={styles.heading}>
          {signup ? "Make space for your ideas" : "Welcome back"}
        </Text>
        {signup && (
          <Field
            label="Your name"
            error={errors.name}
            value={name}
            onChangeText={setName}
            maxLength={LIMITS.name}
            autoComplete="name"
            editable={!action.pending}
          />
        )}
        <Field
          label="Email"
          error={errors.email}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          maxLength={254}
          editable={!action.pending}
        />
        <Field
          label="Password"
          error={errors.password}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          autoComplete={signup ? "new-password" : "current-password"}
          maxLength={LIMITS.passwordMax}
          editable={!action.pending}
          onSubmitEditing={submit}
        />
        <Text style={styles.muted}>
          Use at least {LIMITS.passwordMin} characters.
        </Text>
        <ErrorNotice error={action.error} />
        <Button
          primary
          title={
            action.pending ? "Please wait…" : signup ? "Sign up" : "Log in"
          }
          onPress={submit}
          disabled={action.pending}
        />
        <Button
          title={
            signup ? "Already have an account? Log in" : "New here? Sign up"
          }
          disabled={action.pending}
          onPress={() => {
            setSignup(!signup);
            setPassword("");
            action.clearError();
          }}
        />
      </ScrollView>
    </Screen>
  );
}
