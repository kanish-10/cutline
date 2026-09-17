import type {
  CreateBoard,
  CreateStage,
  UpdateCard,
  UpdateStage,
} from "@cutline/shared";
import { createApiClient } from "@cutline/shared";

export function apiOrigin(value: string | undefined) {
  if (!value)
    throw new Error(
      "Set EXPO_PUBLIC_API_URL to your API origin, then restart Expo.",
    );
  const url = new URL(value);
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
  return url.origin;
}

export function createMobileApi(
  baseUrl: string,
  getCookie: () => Promise<string>,
) {
  async function request<T>(
    action: (client: ReturnType<typeof createApiClient>) => Promise<T>,
  ) {
    const cookie = await getCookie();
    return action(createApiClient(baseUrl, () => ({ Cookie: cookie })));
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
