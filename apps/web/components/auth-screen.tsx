"use client";

import { APP, credentialsSchema, LIMITS, signupSchema } from "@cutline/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AUTH_STEPS, UI } from "../constants";
import { Brand } from "./brand";
import { ErrorNotice, useClients } from "./workspace";

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: () => unknown;
}) {
  const { auth } = useClients();
  const queryClient = useQueryClient();
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  return (
    <main className="auth-shell">
      <section className="auth-story">
        <Brand>{APP.name}</Brand>
        <div>
          <p className="eyebrow">A WORKSPACE FOR CREATORS</p>
          <h1>
            Good work
            <br />
            starts with
            <br />
            <em>a little space.</em>
          </h1>
          <p className="story-copy">
            Bring your ideas, notes, and next steps together. A considered space
            to take your work from the first spark to the final cut.
          </p>
          <ol className="story-steps">
            {AUTH_STEPS.map((step, index) => (
              <li key={step.title}>
                <span aria-hidden="true" className="step-index">
                  0{index + 1}
                </span>
                <div>
                  <h2>{step.title}</h2>
                  <p>{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className="story-footer">
          VIDEO <span aria-hidden="true">/</span> PODCASTS{" "}
          <span aria-hidden="true">/</span> WRITING
        </p>
      </section>
      <section className="auth-form-wrap">
        <form
          className="auth-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (pending) return;
            setError(null);
            const input = {
              email: email.trim(),
              password,
              ...(signup ? { name: name.trim() } : {}),
            };
            const parsed = (
              signup ? signupSchema : credentialsSchema
            ).safeParse(input);
            if (!parsed.success) {
              setError(new Error(parsed.error.issues[0]?.message));
              return;
            }
            setPending(true);
            try {
              const result = signup
                ? await auth.signUp.email({
                    email: email.trim(),
                    password,
                    name: name.trim(),
                  })
                : await auth.signIn.email({ email: email.trim(), password });
              if (result.error)
                throw new Error(
                  result.error.message ||
                    "Authentication failed. Please try again.",
                );
              queryClient.clear();
              await onAuthenticated();
            } catch (error) {
              setError(error);
            } finally {
              setPending(false);
            }
          }}
        >
          <p className="eyebrow">
            {signup ? "START YOUR WORKSPACE" : "WELCOME BACK"}
          </p>
          <h2>{signup ? "Create your account" : "Sign in"}</h2>
          <p className="muted">
            {signup
              ? "One account for every board you make."
              : "Pick up right where you left off."}
          </p>
          <fieldset disabled={pending}>
            {signup && (
              <label>
                Your name
                <input
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  maxLength={LIMITS.name}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                maxLength={UI.emailMax}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={LIMITS.passwordMin}
                maxLength={LIMITS.passwordMax}
                aria-describedby="password-hint"
              />
            </label>
            <small id="password-hint">
              At least {LIMITS.passwordMin} characters.
            </small>
            <ErrorNotice error={error} />
            <button className="primary full" type="submit">
              {pending ? "Signing in…" : signup ? "Create account" : "Sign in"}
            </button>
            <p className="auth-switch">
              {signup ? "Already have an account?" : "New here?"}{" "}
              <button
                className="text-button"
                type="button"
                onClick={() => {
                  setSignup(!signup);
                  setError(null);
                }}
              >
                {signup ? "Sign in" : "Create an account"}
              </button>
            </p>
          </fieldset>
        </form>
      </section>
    </main>
  );
}
