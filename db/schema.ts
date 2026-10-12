import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const transactions = sqliteTable('ledger_transactions', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(),
  day: text('day').notNull(), occurredAt: text('occurred_at').notNull(),
  status: text('status').notNull(), payload: text('payload').notNull(),
  eventKey: text('event_key'), createdAt: text('created_at').notNull(),
}, table => [index('transactions_owner_day').on(table.ownerId, table.day), index('transactions_event_key').on(table.ownerId, table.eventKey)]);
export const configuration = sqliteTable('ledger_configuration', {
  ownerId: text('owner_id').primaryKey(), settings: text('settings').notNull(),
  encryptedCredential: text('encrypted_credential'), updatedAt: text('updated_at').notNull(),
});
export const metadata = sqliteTable('ledger_metadata', { key: text('key').primaryKey(), value: text('value').notNull() });
export const deliveries = sqliteTable('ledger_deliveries', {
  id: text('id').primaryKey(), ownerId: text('owner_id').notNull(), reportDay: text('report_day').notNull(),
  provider: text('provider').notNull(), status: text('status').notNull(),
  claimToken: text('claim_token'),
  attempts: integer('attempts').notNull().default(0), error: text('error'), sentAt: text('sent_at'),
});
