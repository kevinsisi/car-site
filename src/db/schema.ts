import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const vehicles = sqliteTable(
  'vehicles',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    cardTitleSupplement: text('card_title_supplement').notNull().default(''),
    brand: text('brand').notNull(),
    model: text('model').notNull(),
    subModel: text('sub_model').notNull().default(''),
    year: text('year').notNull().default(''),
    mileage: text('mileage').notNull().default(''),
    exteriorColor: text('exterior_color').notNull().default(''),
    interiorColor: text('interior_color').notNull().default(''),
    condition: text('condition').notNull().default('嚴選車況'),
    status: text('status').notNull().default('draft'),
    headline: text('headline').notNull().default(''),
    description: text('description').notNull().default(''),
    featuresJson: text('features_json').notNull().default('[]'),
    monthlyRecommended: integer('monthly_recommended', { mode: 'boolean' }).notNull().default(false),
    internalPrice: integer('internal_price'),
    source: text('source').notNull().default('manual'),
    externalId: text('external_id'),
    localEditsJson: text('local_edits_json').notNull().default('[]'),
    soldAt: text('sold_at'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    sourceExternalIdx: uniqueIndex('vehicles_source_external_idx').on(table.source, table.externalId),
  }),
);

export const vehicleImages = sqliteTable('vehicle_images', {
  id: text('id').primaryKey(),
  vehicleId: text('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  alt: text('alt').notNull().default(''),
  sortOrder: integer('sort_order').notNull().default(0),
  isCover: integer('is_cover', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull(),
});

export const siteSettings = sqliteTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const brandAliases = sqliteTable('brand_aliases', {
  sourceBrand: text('source_brand').primaryKey(),
  displayName: text('display_name').notNull(),
  urlSlug: text('url_slug').notNull().default(''),
  updatedAt: text('updated_at').notNull(),
});

export const importMappings = sqliteTable(
  'import_mappings',
  {
    id: text('id').primaryKey(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    vehicleId: text('vehicle_id').notNull().references(() => vehicles.id, { onDelete: 'cascade' }),
    lastImportedAt: text('last_imported_at').notNull(),
  },
  (table) => ({
    sourceExternalIdx: uniqueIndex('import_mappings_source_external_idx').on(table.source, table.externalId),
  }),
);

export const adminUsers = sqliteTable('admin_users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: text('created_at').notNull(),
});

export const adminSessions = sqliteTable('admin_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
});

export type VehicleStatus = 'draft' | 'published' | 'incoming' | 'reserved' | 'special' | 'unknown' | 'unpublished' | 'sold' | 'archived';
export type ImportBehavior = 'draft_first' | 'auto_publish' | 'import_only';
export type PublishMode = 'use_default' | 'draft' | 'publish';
