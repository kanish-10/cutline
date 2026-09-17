import { randomUUID } from "node:crypto";
import {
  CHECKLISTS,
  createBoardSchema,
  createCardSchema,
  createStageSchema,
  idSchema,
  LIMITS,
  STAGE_COLORS,
  TEMPLATES,
  updateCardSchema,
  updateStageSchema,
} from "@cutline/shared";
import { and, asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { ZodError } from "zod";
import type { Auth } from "./auth.js";
import type { Config } from "./config.js";
import { SERVER } from "./config.js";
import type { AppDatabase } from "./database.js";
import { boards, cards, stages } from "./schema.js";

export function createApp(db: AppDatabase, auth: Auth, config: Config) {
  const app = new Hono<{ Variables: { userId: string } }>();
  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: config.WEB_ORIGIN,
      credentials: true,
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "expo-origin", "x-skip-oauth-proxy"],
    }),
  );
  app.use(
    "*",
    bodyLimit({
      maxSize: LIMITS.bodyBytes,
      onError: (c) => c.json({ error: "Request is too large" }, 413),
    }),
  );
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    const origin = c.req.header("Origin");
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      if (
        origin &&
        origin !== config.WEB_ORIGIN &&
        origin !== `${"cutline"}://`
      )
        throw new HTTPException(403, { message: "Origin not allowed" });
      if (c.req.header("sec-fetch-site") === "cross-site")
        throw new HTTPException(403, {
          message: "Cross-site request not allowed",
        });
      if (
        ["POST", "PATCH"].includes(c.req.method) &&
        !c.req
          .header("Content-Type")
          ?.toLowerCase()
          .startsWith("application/json")
      )
        throw new HTTPException(415, { message: "JSON body required" });
    }
    await next();
  });
  app.get("/health", (c) => c.json({ ok: true }));
  app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  const requests = new Map<string, { count: number; expires: number }>();
  app.use("/api/*", async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) throw new HTTPException(401, { message: "Please sign in" });
    c.set("userId", session.user.id);
    const now = Date.now();
    for (const [key, entry] of requests)
      if (entry.expires <= now) requests.delete(key);
    const bucket = requests.get(session.user.id) ?? {
      count: 0,
      expires: now + SERVER.rateWindowSeconds * 1000,
    };
    bucket.count += 1;
    requests.set(session.user.id, bucket);
    if (bucket.count > SERVER.apiRequests)
      throw new HTTPException(429, {
        message: "Please slow down and try again shortly",
      });
    await next();
  });
  function ownedBoard(userId: string) {
    const board = db
      .select()
      .from(boards)
      .where(eq(boards.userId, userId))
      .get();
    if (!board) throw new HTTPException(404, { message: "Board not found" });
    return board;
  }
  function boardData(userId: string) {
    const board = db
      .select()
      .from(boards)
      .where(eq(boards.userId, userId))
      .get();
    if (!board) return null;
    return {
      id: board.id,
      creatorType: board.creatorType,
      stages: db
        .select()
        .from(stages)
        .where(eq(stages.boardId, board.id))
        .orderBy(asc(stages.position))
        .all(),
      cards: db
        .select()
        .from(cards)
        .where(eq(cards.boardId, board.id))
        .orderBy(asc(cards.createdAt))
        .all(),
    };
  }
  app.get("/api/board", (c) => c.json(boardData(c.get("userId"))));
  app.post("/api/board", async (c) => {
    const input = createBoardSchema.parse(await c.req.json());
    const userId = c.get("userId");
    db.transaction((tx) => {
      if (tx.select().from(boards).where(eq(boards.userId, userId)).get())
        throw new HTTPException(409, { message: "You already have a board" });
      const boardId = randomUUID();
      tx.insert(boards)
        .values({ id: boardId, userId, creatorType: input.creatorType })
        .run();
      for (const [position, name] of TEMPLATES[input.creatorType].entries())
        tx.insert(stages)
          .values({
            id: randomUUID(),
            boardId,
            position,
            name,
            color:
              STAGE_COLORS[position % STAGE_COLORS.length] ?? STAGE_COLORS[0],
          })
          .run();
    });
    return c.json(boardData(userId), 201);
  });
  app.post("/api/cards", async (c) => {
    const input = createCardSchema.parse(await c.req.json());
    const board = ownedBoard(c.get("userId"));
    const result = db.transaction((tx) => {
      if (
        (tx
          .select({ value: count() })
          .from(cards)
          .where(eq(cards.boardId, board.id))
          .get()?.value ?? 0) >= LIMITS.cards
      )
        throw new HTTPException(409, { message: "Board card limit reached" });
      const boardStages = tx
        .select()
        .from(stages)
        .where(eq(stages.boardId, board.id))
        .orderBy(asc(stages.position))
        .all();
      const firstStage = boardStages[0];
      if (!firstStage)
        throw new HTTPException(409, { message: "Create a stage first" });
      const now = new Date().toISOString();
      const checklist = boardStages.flatMap((stage) =>
        (CHECKLISTS[stage.name] ?? ["Add a step"]).map((text) => ({
          id: randomUUID(),
          text,
          done: false,
        })),
      );
      return tx
        .insert(cards)
        .values({
          id: randomUUID(),
          boardId: board.id,
          stageId: firstStage.id,
          title: input.title,
          checklist,
          tags: [],
          links: [],
          createdAt: now,
          updatedAt: now,
        })
        .returning()
        .get();
    });
    return c.json(result, 201);
  });
  app.patch("/api/cards/:id", async (c) => {
    const id = idSchema.parse(c.req.param("id"));
    const { version, ...input } = updateCardSchema.parse(await c.req.json());
    const board = ownedBoard(c.get("userId"));
    const result = db.transaction((tx) => {
      const card = tx
        .select()
        .from(cards)
        .where(and(eq(cards.id, id), eq(cards.boardId, board.id)))
        .get();
      if (!card) throw new HTTPException(404, { message: "Card not found" });
      if (card.version !== version)
        throw new HTTPException(409, {
          message:
            "This card changed on another device. Refresh and try again.",
        });
      let publishedAt = card.publishedAt;
      if (input.stageId && input.stageId !== card.stageId) {
        const boardStages = tx
          .select()
          .from(stages)
          .where(eq(stages.boardId, board.id))
          .orderBy(asc(stages.position))
          .all();
        if (!boardStages.some((stage) => stage.id === input.stageId))
          throw new HTTPException(400, {
            message: "Stage must belong to this board",
          });
        publishedAt =
          boardStages.at(-1)?.id === input.stageId
            ? new Date().toISOString()
            : null;
      }
      return tx
        .update(cards)
        .set({
          ...input,
          publishedAt,
          version: version + 1,
          updatedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(cards.id, id),
            eq(cards.boardId, board.id),
            eq(cards.version, version),
          ),
        )
        .returning()
        .get();
    });
    return c.json(result);
  });
  app.post("/api/stages", async (c) => {
    const input = createStageSchema.parse(await c.req.json());
    const board = ownedBoard(c.get("userId"));
    const stage = db.transaction((tx) => {
      const list = tx
        .select()
        .from(stages)
        .where(eq(stages.boardId, board.id))
        .all();
      if (list.length >= LIMITS.stages)
        throw new HTTPException(409, { message: "Stage limit reached" });
      return tx
        .insert(stages)
        .values({
          ...input,
          id: randomUUID(),
          boardId: board.id,
          position: list.length,
        })
        .returning()
        .get();
    });
    return c.json(stage, 201);
  });
  app.patch("/api/stages/:id", async (c) => {
    const id = idSchema.parse(c.req.param("id"));
    const { direction, ...input } = updateStageSchema.parse(await c.req.json());
    const board = ownedBoard(c.get("userId"));
    const result = db.transaction((tx) => {
      const list = tx
        .select()
        .from(stages)
        .where(eq(stages.boardId, board.id))
        .orderBy(asc(stages.position))
        .all();
      const index = list.findIndex((stage) => stage.id === id);
      const stage = list[index];
      if (!stage) throw new HTTPException(404, { message: "Stage not found" });
      let position = stage.position;
      if (direction) {
        const neighbor = list[index + (direction === "left" ? -1 : 1)];
        if (!neighbor)
          throw new HTTPException(400, {
            message: "Stage is already at the edge",
          });
        position = neighbor.position;
        tx.update(stages)
          .set({ position: stage.position })
          .where(eq(stages.id, neighbor.id))
          .run();
      }
      return tx
        .update(stages)
        .set({ ...input, position })
        .where(eq(stages.id, id))
        .returning()
        .get();
    });
    return c.json(result);
  });
  app.delete("/api/stages/:id", (c) => {
    const id = idSchema.parse(c.req.param("id"));
    const board = ownedBoard(c.get("userId"));
    db.transaction((tx) => {
      const list = tx
        .select()
        .from(stages)
        .where(eq(stages.boardId, board.id))
        .orderBy(asc(stages.position))
        .all();
      if (!list.some((stage) => stage.id === id))
        throw new HTTPException(404, { message: "Stage not found" });
      if (list.length === 1)
        throw new HTTPException(409, { message: "Keep at least one stage" });
      if (
        tx
          .select({ id: cards.id })
          .from(cards)
          .where(eq(cards.stageId, id))
          .get()
      )
        throw new HTTPException(409, {
          message: "Move cards out first, including archived cards",
        });
      tx.delete(stages).where(eq(stages.id, id)).run();
      list
        .filter((stage) => stage.id !== id)
        .forEach((stage, position) => {
          tx.update(stages)
            .set({ position })
            .where(eq(stages.id, stage.id))
            .run();
        });
    });
    return c.json({ ok: true });
  });
  app.onError((error, c) => {
    if (error instanceof ZodError)
      return c.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        400,
      );
    if (error instanceof SyntaxError)
      return c.json({ error: "Invalid JSON" }, 400);
    if (error instanceof HTTPException)
      return c.json({ error: error.message }, error.status);
    return c.json({ error: "An unexpected error occurred" }, 500);
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
