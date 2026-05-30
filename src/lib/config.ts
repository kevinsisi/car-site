import path from 'node:path';

export const appConfig = {
  databasePath: process.env.DATABASE_PATH || path.resolve(process.cwd(), 'data', 'car-site.db'),
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-change-before-production',
  importApiToken: process.env.IMPORT_API_TOKEN || '',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'change-me-now',
  siteName: 'Private Motor Salon',
};

export const ONE_DAY_SECONDS = 24 * 60 * 60;
