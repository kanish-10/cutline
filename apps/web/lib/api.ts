"use client";

import { createApiClient } from "@cutline/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const api = createApiClient(API_URL, () => ({}));

export const createScopedApi = (boardId: string) => {
  return createApiClient(API_URL, () => ({}), boardId);
};
