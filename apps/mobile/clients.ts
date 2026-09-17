import { expoClient } from "@better-auth/expo/client";
import { APP, TIMING } from "@cutline/shared";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";
import { createContext, useContext } from "react";
import { createMobileApi } from "./api";

export function createClients(baseURL: string) {
  const authClient = createAuthClient({
    baseURL,
    basePath: APP.authPath,
    fetchOptions: { timeout: TIMING.requestMs },
    plugins: [
      expoClient({
        scheme: APP.scheme,
        storagePrefix: APP.scheme,
        storage: SecureStore,
      }),
    ],
  });
  return {
    authClient,
    api: createMobileApi(baseURL, () => authClient.getCookie()),
  };
}

export const ClientContext = createContext<ReturnType<
  typeof createClients
> | null>(null);

export function useClients() {
  const clients = useContext(ClientContext);
  if (!clients) throw new Error("Missing mobile clients.");
  return clients;
}
