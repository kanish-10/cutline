import { randomUUID } from "node:crypto";
import {
  CHECKLISTS,
  type ChecklistItem,
  createBoardSchema,
  createCardSchema,
  createStageSchema,
  ERROR_CODES,
  type ExportOptions,
  idSchema,
  LIMITS,
  type RepurposingLink,
  STAGE_COLORS,
  TEMPLATES,
  updateCardSchema,
  updateStageSchema,
} from "@cutline/shared";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
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
import {
  boards,
  brandDeals,
  cards,
  repurposingLinks,
  stages,
  subscription,
} from "./schema.js";

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
  function findBoard(userId: string, boardId?: string) {
    return db
      .select()
      .from(boards)
      .where(
        and(
          eq(boards.userId, userId),
          boardId === undefined
            ? undefined
            : eq(boards.id, idSchema.parse(boardId)),
        ),
      )
      .orderBy(asc(boards.createdAt), asc(boards.id))
      .get();
  }
  function ownedBoard(userId: string, boardId?: string) {
    const board = findBoard(userId, boardId);
    if (!board) throw new HTTPException(404, { message: "Board not found" });
    return board;
  }
  function boardData(board: typeof boards.$inferSelect | undefined) {
    if (!board) return null;
    return {
      id: board.id,
      name: board.name,
      createdAt: board.createdAt,
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
  app.get("/api/board", (c) => c.json(boardData(findBoard(c.get("userId")))));
  app.get("/api/boards", (c) =>
    c.json(
      db
        .select({
          id: boards.id,
          name: boards.name,
          createdAt: boards.createdAt,
          creatorType: boards.creatorType,
          cardCount: count(cards.id),
        })
        .from(boards)
        .leftJoin(cards, eq(cards.boardId, boards.id))
        .where(eq(boards.userId, c.get("userId")))
        .groupBy(boards.id)
        .orderBy(asc(boards.createdAt), asc(boards.id))
        .all(),
    ),
  );
  app.get("/api/boards/:boardId", (c) =>
    c.json(boardData(ownedBoard(c.get("userId"), c.req.param("boardId")))),
  );
  app.delete("/api/boards/:boardId", (c) => {
    const id = idSchema.parse(c.req.param("boardId"));
    db.transaction((tx) => {
      const board = tx
        .select()
        .from(boards)
        .where(and(eq(boards.id, id), eq(boards.userId, c.get("userId"))))
        .get();
      if (!board) throw new HTTPException(404, { message: "Board not found" });
      if (
        tx
          .select({ id: cards.id })
          .from(cards)
          .where(eq(cards.boardId, id))
          .get()
      )
        throw new HTTPException(409, {
          message: "Remove all cards first, including archived cards",
          cause: { code: ERROR_CODES.boardNotEmpty },
        });
      tx.delete(boards).where(eq(boards.id, id)).run();
    });
    return c.json({ ok: true });
  });
  app.on("POST", ["/api/board", "/api/boards"], async (c) => {
    const input = createBoardSchema.parse(await c.req.json());
    const userId = c.get("userId");
    const boardId = randomUUID();
    db.transaction((tx) => {
      if (
        c.req.path === "/api/board" &&
        tx.select().from(boards).where(eq(boards.userId, userId)).get()
      )
        throw new HTTPException(409, { message: "You already have a board" });
      tx.insert(boards)
        .values({
          id: boardId,
          userId,
          creatorType: input.creatorType,
          name: input.name ?? "My board",
          createdAt: new Date().toISOString(),
        })
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
    return c.json(boardData(ownedBoard(userId, boardId)), 201);
  });
  const activeCardCount = (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    boardId: string,
  ) =>
    tx
      .select({ value: count() })
      .from(cards)
      .where(and(eq(cards.boardId, boardId), eq(cards.archived, false)))
      .get()?.value ?? 0;
  app.post("/api/cards", async (c) => {
    const input = createCardSchema.parse(await c.req.json());
    const board = ownedBoard(c.get("userId"), c.req.query("boardId"));
    const result = db.transaction((tx) => {
      if (activeCardCount(tx, board.id) >= LIMITS.cards)
        throw new HTTPException(409, {
          message: `Your board has reached its ${LIMITS.cards}-active-card limit. Archive an idea to make room.`,
          cause: { code: ERROR_CODES.cardLimit },
        });
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
    const result = db.transaction((tx) => {
      const card = tx
        .select({ card: cards })
        .from(cards)
        .innerJoin(boards, eq(boards.id, cards.boardId))
        .where(and(eq(cards.id, id), eq(boards.userId, c.get("userId"))))
        .get()?.card;
      if (!card) throw new HTTPException(404, { message: "Card not found" });
      if (card.version !== version)
        throw new HTTPException(409, {
          message:
            "This card changed on another device. Refresh and try again.",
        });
      if (card.archived && input.archived === false) {
        if (activeCardCount(tx, card.boardId) >= LIMITS.cards)
          throw new HTTPException(409, {
            message: `Your board already has ${LIMITS.cards} active ideas. Archive one before restoring this.`,
            cause: { code: ERROR_CODES.cardLimit },
          });
      }
      let publishedAt = card.publishedAt;
      if (input.stageId && input.stageId !== card.stageId) {
        const boardStages = tx
          .select()
          .from(stages)
          .where(eq(stages.boardId, card.boardId))
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
            eq(cards.boardId, card.boardId),
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
    const board = ownedBoard(c.get("userId"), c.req.query("boardId"));
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
  function ownedStage(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string,
    id: string,
  ) {
    const stage = tx
      .select({ stage: stages })
      .from(stages)
      .innerJoin(boards, eq(boards.id, stages.boardId))
      .where(and(eq(stages.id, id), eq(boards.userId, userId)))
      .get()?.stage;
    if (!stage) throw new HTTPException(404, { message: "Stage not found" });
    return stage;
  }
  app.patch("/api/stages/:id", async (c) => {
    const id = idSchema.parse(c.req.param("id"));
    const { direction, ...input } = updateStageSchema.parse(await c.req.json());
    const result = db.transaction((tx) => {
      const owned = ownedStage(tx, c.get("userId"), id);
      const list = tx
        .select()
        .from(stages)
        .where(eq(stages.boardId, owned.boardId))
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
    db.transaction((tx) => {
      const owned = ownedStage(tx, c.get("userId"), id);
      const list = tx
        .select()
        .from(stages)
        .where(eq(stages.boardId, owned.boardId))
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

  app.get("/api/dashboard", (c) => {
    const userId = c.get("userId");
    const now = new Date();
    const periodStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
    ).toISOString();
    const periodEnd = now.toISOString();

    const userCards = db
      .select({
        id: cards.id,
        boardId: cards.boardId,
        stageId: cards.stageId,
        archived: cards.archived,
        createdAt: cards.createdAt,
        publishedAt: cards.publishedAt,
        tags: cards.tags,
      })
      .from(cards)
      .innerJoin(boards, eq(boards.id, cards.boardId))
      .where(eq(boards.userId, userId))
      .all();

    const cardsCreated = userCards.filter(
      (c) => c.createdAt >= periodStart && c.createdAt <= periodEnd,
    ).length;
    const cardsPublished = userCards.filter(
      (c) =>
        c.publishedAt &&
        c.publishedAt >= periodStart &&
        c.publishedAt <= periodEnd,
    ).length;
    const cardsArchived = userCards.filter((c) => c.archived).length;

    const completedCards = userCards.filter(
      (c): c is typeof c & { publishedAt: string } => !!c.publishedAt,
    );
    const averageTimeToPublish =
      completedCards.length > 0
        ? completedCards.reduce(
            (sum, c) =>
              sum +
              (new Date(c.publishedAt).getTime() -
                new Date(c.createdAt).getTime()),
            0,
          ) /
          completedCards.length /
          (1000 * 60 * 60 * 24)
        : 0;

    const totalCards = userCards.filter((c) => !c.archived).length;
    const completionRate = totalCards > 0 ? cardsPublished / totalCards : 0;
    const velocity = cardsCreated;

    const stageBottlenecks: Record<string, number> = {};
    for (const card of userCards.filter((c) => !c.archived)) {
      const stage = db
        .select()
        .from(stages)
        .where(eq(stages.id, card.stageId))
        .get();
      if (stage) {
        stageBottlenecks[stage.name] = (stageBottlenecks[stage.name] || 0) + 1;
      }
    }

    const tagCounts: Record<string, number> = {};
    for (const card of userCards) {
      for (const tag of card.tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    const topTags = Object.entries(tagCounts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const repurposingCount =
      db
        .select({ count: count() })
        .from(repurposingLinks)
        .innerJoin(cards, eq(cards.id, repurposingLinks.parentCardId))
        .innerJoin(boards, eq(boards.id, cards.boardId))
        .where(eq(boards.userId, userId))
        .get()?.count ?? 0;

    const activeBrandDeals =
      db
        .select({ count: count() })
        .from(brandDeals)
        .where(
          and(eq(brandDeals.userId, userId), eq(brandDeals.status, "active")),
        )
        .get()?.count ?? 0;

    const brandDealsRevenue =
      db
        .select({ total: sql<number>`sum(${brandDeals.totalValue})` })
        .from(brandDeals)
        .where(
          and(eq(brandDeals.userId, userId), eq(brandDeals.status, "active")),
        )
        .get()?.total ?? 0;

    return c.json({
      userId,
      periodStart,
      periodEnd,
      cardsCreated,
      cardsPublished,
      cardsArchived,
      averageTimeToPublish,
      completionRate,
      velocity,
      stageBottlenecks,
      topTags,
      repurposingCount,
      brandDealsActive: activeBrandDeals,
      brandDealsRevenue,
    });
  });

  app.get("/api/repurposing", (c) => {
    const userId = c.get("userId");
    return c.json(
      db
        .select({
          id: repurposingLinks.id,
          parentCardId: repurposingLinks.parentCardId,
          childCardId: repurposingLinks.childCardId,
          platform: repurposingLinks.platform,
          customPlatform: repurposingLinks.customPlatform,
          status: repurposingLinks.status,
          createdAt: repurposingLinks.createdAt,
          publishedAt: repurposingLinks.publishedAt,
        })
        .from(repurposingLinks)
        .innerJoin(cards, eq(cards.id, repurposingLinks.parentCardId))
        .innerJoin(boards, eq(boards.id, cards.boardId))
        .where(eq(boards.userId, userId))
        .orderBy(desc(repurposingLinks.createdAt))
        .all(),
    );
  });

  app.post("/api/repurposing", async (c) => {
    const userId = c.get("userId");
    const input = (await c.req.json()) as Omit<
      RepurposingLink,
      "id" | "createdAt"
    >;

    const parentCard = db
      .select({ id: cards.id })
      .from(cards)
      .innerJoin(boards, eq(boards.id, cards.boardId))
      .where(and(eq(cards.id, input.parentCardId), eq(boards.userId, userId)))
      .get();

    if (!parentCard)
      throw new HTTPException(404, { message: "Parent card not found" });

    const childCard = db
      .select({ id: cards.id })
      .from(cards)
      .innerJoin(boards, eq(boards.id, cards.boardId))
      .where(and(eq(cards.id, input.childCardId), eq(boards.userId, userId)))
      .get();

    if (!childCard)
      throw new HTTPException(404, { message: "Child card not found" });

    const id = randomUUID();
    const createdAt = new Date().toISOString();
    db.insert(repurposingLinks)
      .values({ ...input, id, createdAt })
      .run();

    return c.json({ ...input, id, createdAt }, 201);
  });

  app.patch("/api/repurposing/:id", async (c) => {
    const userId = c.get("userId");
    const id = idSchema.parse(c.req.param("id"));
    const input = await c.req.json();

    const link = db
      .select()
      .from(repurposingLinks)
      .innerJoin(cards, eq(cards.id, repurposingLinks.parentCardId))
      .innerJoin(boards, eq(boards.id, cards.boardId))
      .where(and(eq(repurposingLinks.id, id), eq(boards.userId, userId)))
      .get();

    if (!link)
      throw new HTTPException(404, { message: "Repurposing link not found" });

    const publishedAt =
      input.status === "published" && !link.repurposing_links.publishedAt
        ? new Date().toISOString()
        : input.publishedAt;

    db.update(repurposingLinks)
      .set({ ...input, publishedAt })
      .where(eq(repurposingLinks.id, id))
      .run();

    return c.json({ ...link.repurposing_links, ...input, publishedAt });
  });

  app.get("/api/brand-deals", (c) => {
    const userId = c.get("userId");
    return c.json(
      db
        .select({
          id: brandDeals.id,
          cardId: brandDeals.cardId,
          brandName: brandDeals.brandName,
          contactEmail: brandDeals.contactEmail,
          contactName: brandDeals.contactName,
          totalValue: brandDeals.totalValue,
          currency: brandDeals.currency,
          status: brandDeals.status,
          startDate: brandDeals.startDate,
          endDate: brandDeals.endDate,
          contractUrl: brandDeals.contractUrl,
          notes: brandDeals.notes,
          createdAt: brandDeals.createdAt,
          updatedAt: brandDeals.updatedAt,
        })
        .from(brandDeals)
        .where(eq(brandDeals.userId, userId))
        .orderBy(desc(brandDeals.createdAt))
        .all(),
    );
  });

  app.post("/api/brand-deals", async (c) => {
    const userId = c.get("userId");
    const input = (await c.req.json()) as Omit<
      typeof brandDeals.$inferInsert,
      "id" | "createdAt" | "updatedAt" | "userId"
    >;

    if (input.cardId) {
      const card = db
        .select({ id: cards.id })
        .from(cards)
        .innerJoin(boards, eq(boards.id, cards.boardId))
        .where(and(eq(cards.id, input.cardId), eq(boards.userId, userId)))
        .get();
      if (!card) throw new HTTPException(404, { message: "Card not found" });
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    db.insert(brandDeals)
      .values({ ...input, id, userId, createdAt: now, updatedAt: now })
      .run();

    return c.json(
      { ...input, id, userId, createdAt: now, updatedAt: now },
      201,
    );
  });

  app.patch("/api/brand-deals/:id", async (c) => {
    const userId = c.get("userId");
    const id = idSchema.parse(c.req.param("id"));
    const input = await c.req.json();

    const deal = db
      .select()
      .from(brandDeals)
      .where(and(eq(brandDeals.id, id), eq(brandDeals.userId, userId)))
      .get();
    if (!deal)
      throw new HTTPException(404, { message: "Brand deal not found" });

    db.update(brandDeals)
      .set({ ...input, updatedAt: new Date().toISOString() })
      .where(eq(brandDeals.id, id))
      .run();

    return c.json({ ...deal, ...input, updatedAt: new Date().toISOString() });
  });

  app.post("/api/export", async (c) => {
    const userId = c.get("userId");
    const options = (await c.req.json()) as ExportOptions;

    const userBoards = options.boardId
      ? db
          .select()
          .from(boards)
          .where(and(eq(boards.userId, userId), eq(boards.id, options.boardId)))
          .all()
      : db.select().from(boards).where(eq(boards.userId, userId)).all();

    interface ExportBoard {
      id: string;
      name: string;
      creatorType: string;
      createdAt: string;
      stages: Array<{ id: string; name: string; position: number }>;
      cards: Array<{
        id: string;
        title: string;
        notes: string;
        checklist: ChecklistItem[];
        tags: string[];
        links: string[];
        archived: boolean;
        version: number;
        createdAt: string;
        updatedAt: string;
        publishedAt: string | null;
        stageId: string;
      }>;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      userId,
      boards: [] as ExportBoard[],
    };

    for (const board of userBoards) {
      const boardStages = db
        .select()
        .from(stages)
        .where(eq(stages.boardId, board.id))
        .orderBy(asc(stages.position))
        .all();
      const boardCards = db
        .select()
        .from(cards)
        .where(
          and(
            eq(cards.boardId, board.id),
            options.includeArchived ? undefined : eq(cards.archived, false),
          ),
        )
        .orderBy(asc(cards.createdAt))
        .all();

      exportData.boards.push({
        id: board.id,
        name: board.name,
        creatorType: board.creatorType,
        createdAt: board.createdAt,
        stages: boardStages,
        cards: boardCards.map((card) => ({
          ...card,
          tags: options.includeTags ? card.tags : [],
          links: options.includeLinks ? card.links : [],
          checklist: options.includeChecklists ? card.checklist : [],
        })),
      });
    }

    if (options.format === "json") {
      return c.json(exportData);
    }

    if (options.format === "csv") {
      const rows = [
        [
          "Board",
          "Stage",
          "Title",
          "Notes",
          "Status",
          "Tags",
          "Links",
          "Created",
          "Published",
        ],
      ];
      for (const board of exportData.boards) {
        const boardStages = db
          .select()
          .from(stages)
          .where(eq(stages.boardId, board.id))
          .all();
        for (const card of board.cards) {
          const stage = boardStages.find((s) => s.id === card.stageId);
          rows.push([
            board.name,
            stage?.name ?? "Unknown",
            card.title,
            card.notes ?? "",
            card.archived
              ? "Archived"
              : card.publishedAt
                ? "Published"
                : "Active",
            card.tags.join("; "),
            card.links.join("; "),
            card.createdAt,
            card.publishedAt ?? "",
          ]);
        }
      }
      const csv = rows
        .map((r) =>
          r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
        )
        .join("\n");
      return c.text(csv, 200, {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="cutline-export.csv"`,
      });
    }

    if (options.format === "notion") {
      return c.json({
        parent: { database_id: "YOUR_NOTION_DATABASE_ID" },
        properties: {
          Name: { title: [{ text: { content: "Cutline Export" } }] },
        },
        children: exportData.boards.flatMap(
          (board: { name: string; cards: Array<{ title: string }> }) => [
            {
              object: "block",
              type: "heading_2",
              heading_2: {
                rich_text: [{ type: "text", text: { content: board.name } }],
              },
            },
            ...board.cards.map((card) => ({
              object: "block",
              type: "paragraph",
              paragraph: {
                rich_text: [{ type: "text", text: { content: card.title } }],
              },
            })),
          ],
        ),
      });
    }

    return c.json({ error: "Unsupported format" }, 400);
  });

  app.get("/api/subscription", (c) => {
    const userId = c.get("userId");
    const sub = db
      .select()
      .from(subscription)
      .where(eq(subscription.userId, userId))
      .get();
    if (!sub) {
      return c.json({ tier: "free" });
    }
    return c.json({
      tier: sub.tier,
      stripeCustomerId: sub.stripeCustomerId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    });
  });

  app.onError((error, c) => {
    if (error instanceof ZodError)
      return c.json(
        { error: error.issues[0]?.message ?? "Invalid input" },
        400,
      );
    if (error instanceof SyntaxError)
      return c.json({ error: "Invalid JSON" }, 400);
    if (error instanceof HTTPException) {
      const cause = error.cause;
      const code =
        typeof cause === "object" && cause && "code" in cause
          ? String(cause.code)
          : undefined;
      return c.json(
        { error: error.message, ...(code ? { code } : {}) },
        error.status,
      );
    }
    return c.json({ error: "An unexpected error occurred" }, 500);
  });
  app.notFound((c) => c.json({ error: "Not found" }, 404));
  return app;
}
