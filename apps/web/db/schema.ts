import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
export const saves = sqliteTable("game_saves", {
 userId:text("user_id").primaryKey(),state:text("state").notNull(),revision:integer("revision").notNull().default(0),updatedAt:integer("updated_at").notNull(),
});
export const receipts=sqliteTable('game_receipts',{
 userId:text('user_id').notNull(),requestId:text('request_id').notNull(),revision:integer('revision').notNull(),fingerprint:text('fingerprint').notNull(),
},t=>[primaryKey({columns:[t.userId,t.requestId]})]);
