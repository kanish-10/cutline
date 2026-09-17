import type {
  CreateBoard,
  CreateStage,
  UpdateCard,
  UpdateStage,
} from "@cutline/shared";
import { createApiClient } from "@cutline/shared";

export function isLocalHost(hostname: string) {
  if (hostname === "localhost" || hostname === "[::1]") return true;
  const parts = hostname.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part)))
    return false;
  const octets = parts.map(Number);
  if (octets.some((part) => part > 255)) return false;
  const [first, second] = octets;
  return (
    first === 127 ||
    first === 10 ||
    (first === 192 && second === 168) ||
    (first === 172 && second !== undefined && second >= 16 && second <= 31)
  );
}

export function apiOrigin(
  value: string | undefined,
  development = typeof __DEV__ !== "undefined" && __DEV__ === true,
) {
  if (!value)
    throw new Error(
      "Set EXPO_PUBLIC_API_URL to your API origin, then restart Expo.",
    );
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL must be a valid HTTPS origin.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must be an http(s) origin without a path or credentials.",
    );
  }
  if (
    url.protocol !== "https:" &&
    !(development && isLocalHost(url.hostname))
  ) {
    throw new Error(
      "Use HTTPS for the API. HTTP is only allowed for localhost or private LAN addresses in a development client.",
    );
  }
  return url.origin;
}

export function createMobileApi(
  baseUrl: string,
  getCookie: () => Promise<string>,
) {
  const origin = apiOrigin(baseUrl);
  async function request<T>(
    action: (client: ReturnType<typeof createApiClient>) => Promise<T>,
  ) {
    const cookie = await getCookie();
    return action(createApiClient(origin, () => ({ Cookie: cookie })));
  }
  return {
    getBoard: () => request((client) => client.getBoard()),
    createBoard: (input: CreateBoard) =>
      request((client) => client.createBoard(input)),
    createCard: (title: string) =>
      request((client) => client.createCard(title)),
    updateCard: (id: string, input: UpdateCard) =>
      request((client) => client.updateCard(id, input)),
    createStage: (input: CreateStage) =>
      request((client) => client.createStage(input)),
    updateStage: (id: string, input: UpdateStage) =>
      request((client) => client.updateStage(id, input)),
    deleteStage: (id: string) => request((client) => client.deleteStage(id)),
  };
}
