import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  csrf: text("csrf").notNull(),
  touched: integer("touched").notNull(),
});
export const workspaces = sqliteTable(
  "workspaces",
  {
    id: text("id").primaryKey(),
    owner: text("owner").notNull(),
    team: text("team").notNull(),
    rev: integer("rev").notNull(),
    state: text("state").notNull(),
    touched: integer("touched").notNull(),
  },
  (t) => [index("ws_touched").on(t.touched)],
);
export const service = sqliteTable("service", {
  id: integer("id").primaryKey(),
  at: integer("at").notNull(),
});
export const attempts = sqliteTable(
  "attempts",
  { id: text("id").primaryKey(), at: integer("at").notNull() },
  (t) => [index("attempts_at").on(t.at)],
);
