"use client";

import { APP, ApiError, createApiClient, TIMING } from "@cutline/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAuthClient } from "better-auth/react";
import { createContext, useContext, useMemo, useState } from "react";
import { UI } from "../constants";
import { AuthScreen } from "./auth-screen";
import { BoardScreen } from "./board-screen";
import { Brand } from "./brand";

function clients(apiUrl: string) {
  return {
    apiUrl,
    api: createApiClient(apiUrl),
    auth: createAuthClient({
      baseURL: apiUrl,
      basePath: APP.authPath,
      fetchOptions: { credentials: "include" },
    }),
  };
}

const ClientContext = createContext<ReturnType<typeof clients> | null>(null);

export function useClients(boardId?: string) {
  const value = useContext(ClientContext);
  const scoped = useMemo(
    () =>
      value && {
        ...value,
        api:
          boardId === undefined
            ? value.api
            : createApiClient(value.apiUrl, undefined, boardId),
      },
    [value, boardId],
  );
  if (!scoped) throw new Error("Missing client provider");
  return scoped;
}

export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}

export function ErrorNotice({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p className="error" role="alert">
      {errorMessage(error)}
    </p>
  );
}

export function Workspace({ apiUrl }: { apiUrl: string }) {
  const [value] = useState(() => clients(apiUrl));
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: TIMING.staleMs,
            refetchInterval: TIMING.pollMs,
            retry: (count, error) =>
              !(error instanceof ApiError && error.status < 500) &&
              count < UI.queryRetries,
          },
          mutations: { retry: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <ClientContext.Provider value={value}>
        <SessionGate />
      </ClientContext.Provider>
    </QueryClientProvider>
  );
}

function SessionGate() {
  const { auth } = useClients();
  const session = auth.useSession();
  if (session.isPending)
    return (
      <main className="center-state" aria-busy="true">
        <Brand>{APP.name}</Brand>
        <p>Opening your workspace…</p>
      </main>
    );
  if (session.error && !session.data)
    return (
      <main className="center-state">
        <h1>We couldn’t check your session</h1>
        <p className="error" role="alert">
          {session.error.message || "Check your connection and try again."}
        </p>
        <button type="button" onClick={() => session.refetch()}>
          Try again
        </button>
      </main>
    );
  if (!session.data)
    return <AuthScreen onAuthenticated={() => session.refetch()} />;
  return (
    <BoardScreen
      key={session.data.user.id}
      user={session.data.user}
      onSignedOut={() => session.refetch()}
    />
  );
}
