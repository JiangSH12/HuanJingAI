import { pgTable, serial, varchar, text, timestamp, boolean, integer, numeric, jsonb, index, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// System health check table (DO NOT DELETE)
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// User profiles - extends Supabase auth.users
export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    email: varchar("email", { length: 255 }).notNull().unique(),
    nickname: varchar("nickname", { length: 128 }),
    avatar_url: text("avatar_url"),
    phone: varchar("phone", { length: 20 }),
    role: varchar("role", { length: 32 }).notNull().default("user"), // guest, user, vip, enterprise_admin, enterprise_member, admin
    membership_tier: varchar("membership_tier", { length: 32 }).notNull().default("free"), // free, basic, pro, enterprise
    membership_expires_at: timestamp("membership_expires_at", { withTimezone: true }),
    credits_balance: integer("credits_balance").notNull().default(0),
    daily_quota_used: integer("daily_quota_used").notNull().default(0),
    daily_quota_limit: integer("daily_quota_limit").notNull().default(5),
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("profiles_email_idx").on(table.email),
    index("profiles_role_idx").on(table.role),
  ]
);

// User works (generated images/videos)
export const works = pgTable(
  "works",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
    title: varchar("title", { length: 255 }),
    type: varchar("type", { length: 32 }).notNull(), // text2img, img2img, text2video, img2video
    prompt: text("prompt"),
    negative_prompt: text("negative_prompt"),
    params: jsonb("params"), // generation parameters
    result_url: text("result_url"), // URL to generated file
    thumbnail_url: text("thumbnail_url"),
    width: integer("width"),
    height: integer("height"),
    duration: numeric("duration", { precision: 6, scale: 2 }), // video duration in seconds
    is_public: boolean("is_public").default(false).notNull(),
    likes_count: integer("likes_count").default(0).notNull(),
    credits_cost: integer("credits_cost").default(0).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("completed"), // pending, processing, completed, failed
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("works_user_id_idx").on(table.user_id),
    index("works_type_idx").on(table.type),
    index("works_is_public_idx").on(table.is_public),
    index("works_created_at_idx").on(table.created_at),
    index("works_status_idx").on(table.status),
  ]
);

// Credit transactions
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
    amount: integer("amount").notNull(), // positive = credit, negative = debit
    balance_after: integer("balance_after").notNull(),
    type: varchar("type", { length: 32 }).notNull(), // purchase, consume, gift, reward, refund
    description: varchar("description", { length: 500 }),
    related_work_id: uuid("related_work_id"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("credit_transactions_user_id_idx").on(table.user_id),
    index("credit_transactions_type_idx").on(table.type),
    index("credit_transactions_created_at_idx").on(table.created_at),
  ]
);

// Orders
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
    order_no: varchar("order_no", { length: 64 }).notNull().unique(),
    product_type: varchar("product_type", { length: 32 }).notNull(), // membership, credits, api
    product_name: varchar("product_name", { length: 255 }).notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    credits_amount: integer("credits_amount"), // credits purchased
    status: varchar("status", { length: 32 }).notNull().default("pending"), // pending, paid, cancelled, refunded
    payment_method: varchar("payment_method", { length: 32 }), // wechat, alipay, stripe
    paid_at: timestamp("paid_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("orders_user_id_idx").on(table.user_id),
    index("orders_order_no_idx").on(table.order_no),
    index("orders_status_idx").on(table.status),
    index("orders_created_at_idx").on(table.created_at),
  ]
);

// User API keys (for custom model access)
export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
    provider: varchar("provider", { length: 64 }).notNull(), // openai, stabilityai, runway, etc.
    api_url: text("api_url"), // full API endpoint URL, e.g. https://api.openai.com/v1/images/generations
    model_name: varchar("model_name", { length: 128 }), // specific model name, e.g. gpt-4, stable-diffusion-xl
    api_key_encrypted: text("api_key_encrypted").notNull(),
    api_key_preview: varchar("api_key_preview", { length: 20 }), // last 4 chars visible
    is_active: boolean("is_active").default(true).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }),
  },
  (table) => [
    index("user_api_keys_user_id_idx").on(table.user_id),
    index("user_api_keys_provider_idx").on(table.provider),
  ]
);

// Work likes
export const workLikes = pgTable(
  "work_likes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    user_id: uuid("user_id").notNull().default(sql`auth.uid()`),
    work_id: uuid("work_id").notNull().references(() => works.id, { onDelete: "cascade" }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("work_likes_user_id_idx").on(table.user_id),
    index("work_likes_work_id_idx").on(table.work_id),
  ]
);
