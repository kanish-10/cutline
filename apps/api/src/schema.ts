import type { ChecklistItem, CreatorType } from "@cutline/shared";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" })
    .notNull()
    .default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_idx").on(table.userId)],
);
export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("account_user_idx").on(table.userId),
    uniqueIndex("account_provider_idx").on(table.providerId, table.accountId),
  ],
);
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const boards = sqliteTable(
  "boards",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    creatorType: text("creator_type").$type<CreatorType>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("boards_user_idx").on(table.userId)],
);
export const stages = sqliteTable(
  "stages",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [index("stages_board_idx").on(table.boardId)],
);
export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    stageId: text("stage_id")
      .notNull()
      .references(() => stages.id),
    title: text("title").notNull(),
    notes: text("notes").notNull().default(""),
    checklist: text("checklist", { mode: "json" })
      .$type<ChecklistItem[]>()
      .notNull(),
    tags: text("tags", { mode: "json" }).$type<string[]>().notNull(),
    links: text("links", { mode: "json" }).$type<string[]>().notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    version: integer("version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    publishedAt: text("published_at"),
  },
  (table) => [
    index("cards_board_idx").on(table.boardId),
    index("cards_stage_idx").on(table.stageId),
  ],
);
export const repurposingLinks = sqliteTable(
  "repurposing_links",
  {
    id: text("id").primaryKey(),
    parentCardId: text("parent_card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    childCardId: text("child_card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    customPlatform: text("custom_platform"),
    status: text("status").notNull().default("planned"),
    createdAt: text("created_at").notNull(),
    publishedAt: text("published_at"),
  },
  (table) => [
    index("repurposing_parent_idx").on(table.parentCardId),
    index("repurposing_child_idx").on(table.childCardId),
  ],
);
export const brandDeals = sqliteTable(
  "brand_deals",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    cardId: text("card_id").references(() => cards.id, {
      onDelete: "set null",
    }),
    brandName: text("brand_name").notNull(),
    contactEmail: text("contact_email"),
    contactName: text("contact_name"),
    totalValue: integer("total_value").notNull().default(0),
    currency: text("currency").notNull().default("USD"),
    status: text("status").notNull().default("negotiating"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    contractUrl: text("contract_url"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("brand_deals_user_idx").on(table.userId)],
);
export const brandDeliverables = sqliteTable(
  "brand_deliverables",
  {
    id: text("id").primaryKey(),
    brandDealId: text("brand_deal_id")
      .notNull()
      .references(() => brandDeals.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: text("due_date").notNull(),
    status: text("status").notNull().default("pending"),
    platform: text("platform"),
    format: text("format"),
    amount: integer("amount"),
  },
  (table) => [index("brand_deliverables_deal_idx").on(table.brandDealId)],
);
export const subscription = sqliteTable("subscription", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  tier: text("tier").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: text("current_period_end"),
  cancelAtPeriodEnd: integer("cancel_at_period_end", {
    mode: "boolean",
  }).default(false),
  updatedAt: text("updated_at").notNull(),
});
