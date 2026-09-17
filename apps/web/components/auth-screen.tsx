"use client";

import { APP, credentialsSchema, LIMITS, signupSchema } from "@cutline/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { UI } from "../constants";
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
        <a className="brand" href="/">
          {APP.name}
          <span className="brand-dot" />
        </a>
        <div>
          <p className="eyebrow">YOUR IDEAS, IN MOTION</p>
          <h1>
            Less managing.
            <br />
            More making.
          </h1>
          <p className="story-copy">
            A little structure for your big ideas. One quiet place to take your
            work from “what if” to out in the world.
          </p>
        </div>
        <div className="story-pipeline" aria-hidden="true">
          <span>Capture</span>
          <span>→</span>
          <span>Create</span>
          <span>→</span>
          <span>Publish</span>
        </div>
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
          <p className="eyebrow">YOUR CREATIVE WORKSPACE</p>
          <h2>{signup ? "Start something good." : "Welcome back."}</h2>
          <p className="muted">
            {signup
              ? "Create an account. Your next idea is waiting."
              : "Pick up where your inspiration left off."}
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
              {pending
                ? "Please wait…"
                : signup
                  ? "Create your account →"
                  : "Sign in →"}
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
