import fs from 'node:fs';
import path from 'node:path';
import { sqlite } from './connection';
import { pruneOldAnalytics } from '@/lib/analytics';

const migrationsDir = path.resolve(process.cwd(), 'src', 'db', 'migrations');
sqlite.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');

const applied = new Set(
  sqlite.prepare('SELECT name FROM schema_migrations').all().map((row) => (row as { name: string }).name),
);

for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
  if (applied.has(file)) continue;
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  const runMigration = sqlite.transaction(() => {
    sqlite.exec(sql);
    sqlite.prepare('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)').run(file, new Date().toISOString());
  });
  runMigration();
  console.log(`Applied migration ${file}`);
}

pruneOldAnalytics().catch((err) => console.error('[analytics] prune failed:', err));
