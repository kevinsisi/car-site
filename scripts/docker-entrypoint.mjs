import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import Database from 'better-sqlite3';

const cwd = process.cwd();
const databasePath = process.env.DATABASE_PATH || path.resolve(cwd, 'data', 'car-site.db');
const migrationsDir = path.resolve(cwd, 'src', 'db', 'migrations');
const now = new Date().toISOString();

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function runMigrations(sqlite) {
  sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(sqlite.prepare('SELECT name FROM schema_migrations').all().map((row) => row.name));
  const files = fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const migrate = sqlite.transaction(() => {
      sqlite.exec(sql);
      sqlite.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
    });
    migrate();
    console.log(`Applied migration ${file}`);
  }
}

function seedRuntimeDefaults(sqlite) {
  const settings = {
    salespersonName: 'Kevin 私人車庫顧問',
    lineUrl: 'https://line.me/R/ti/p/@premium-car',
    phoneNumber: '+886900000000',
    activeTemplate: 'private-salon',
    activeStyle: 'carsmeet-blue',
    importBehavior: 'draft_first',
    showSoldVehicles: 'false',
  };

  const insertSetting = sqlite.prepare('INSERT OR IGNORE INTO site_settings (key, value, updated_at) VALUES (?, ?, ?)');
  for (const [key, value] of Object.entries(settings)) insertSetting.run(key, value, now);

  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'change-me-now';
  const exists = sqlite.prepare('SELECT id FROM admin_users WHERE username = ? LIMIT 1').get(username);
  if (!exists) {
    sqlite.prepare('INSERT INTO admin_users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(randomUUID(), username, hashPassword(password), now);
    console.log(`Created initial admin user ${username}`);
  }
}

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
const sqlite = new Database(databasePath);
sqlite.pragma('foreign_keys = ON');

try {
  runMigrations(sqlite);
  seedRuntimeDefaults(sqlite);
} finally {
  sqlite.close();
}

await import('../dist/server/entry.mjs');
