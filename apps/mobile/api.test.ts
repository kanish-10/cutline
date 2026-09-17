import { afterEach, describe, expect, it, vi } from "vitest";
import { apiOrigin, createMobileApi } from "./api";

const origin = "http://localhost:3001";

afterEach(() => vi.unstubAllGlobals());

describe("mobile API configuration", () => {
  it("normalizes origins", () => {
    expect(apiOrigin(`${origin}/`)).toBe(origin);
  });

  it.each([
    undefined,
    "",
    "not a URL",
    "file:///tmp/api",
    `${origin}/api`,
    `${origin}?token=secret`,
    `${origin}#fragment`,
    "https://user:password@localhost",
  ])("rejects unsafe or ambiguous configuration: %s", (value) => {
    expect(() => apiOrigin(value)).toThrow();
  });
});

describe("secure cookie bridge", () => {
  it("awaits the auth cookie and fetches a fresh cookie for each request", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => null });
    vi.stubGlobal("fetch", fetcher);
    const getCookie = vi
      .fn()
      .mockResolvedValueOnce("session=first")
      .mockResolvedValueOnce("session=second");
    const api = createMobileApi(origin, getCookie);
    await api.getBoard();
    await api.getBoard();
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `${origin}/api/board`,
      expect.objectContaining({ headers: { Cookie: "session=first" } }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `${origin}/api/board`,
      expect.objectContaining({ headers: { Cookie: "session=second" } }),
    );
  });

  it("keeps concurrent request cookies isolated", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetcher);
    let release: (cookie: string) => void = () => {};
    const firstCookie = new Promise<string>((resolve) => {
      release = resolve;
    });
    const getCookie = vi
      .fn()
      .mockReturnValueOnce(firstCookie)
      .mockResolvedValueOnce("session=second");
    const api = createMobileApi(origin, getCookie);
    const first = api.getBoard();
    await api.createCard("Second request");
    release("session=first");
    await first;
    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      `${origin}/api/cards`,
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          Cookie: "session=second",
        },
      }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `${origin}/api/board`,
      expect.objectContaining({ headers: { Cookie: "session=first" } }),
    );
  });

  it("does not send a request when secure storage fails", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const api = createMobileApi(origin, async () => {
      throw new Error("Storage unavailable");
    });
    await expect(api.getBoard()).rejects.toThrow("Storage unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves shared API errors and versioned update contracts", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "Version conflict" }),
    });
    vi.stubGlobal("fetch", fetcher);
    const api = createMobileApi(origin, async () => "session=value");
    await expect(
      api.updateCard("card-id", { version: 3, archived: true }),
    ).rejects.toMatchObject({ status: 409, message: "Version conflict" });
    expect(fetcher).toHaveBeenCalledWith(
      `${origin}/api/cards/card-id`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ version: 3, archived: true }),
      }),
    );
  });
});
