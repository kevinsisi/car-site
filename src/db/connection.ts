import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { appConfig } from '@/lib/config';
import * as schema from './schema';

fs.mkdirSync(path.dirname(appConfig.databasePath), { recursive: true });

const sqlite = new Database(appConfig.databasePath);
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export { sqlite };
