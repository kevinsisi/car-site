import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export async function createD1Db(binding: Parameters<typeof drizzle>[0]) {
  return drizzle(binding, { schema });
}
