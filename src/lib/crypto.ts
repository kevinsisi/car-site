import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { appConfig } from './config';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

export function signSession(sessionId: string): string {
  const signature = createHmac('sha256', appConfig.sessionSecret).update(sessionId).digest('hex');
  return `${sessionId}.${signature}`;
}

export function verifySignedSession(value: string): string | null {
  const [sessionId, signature] = value.split('.');
  if (!sessionId || !signature) return null;
  const expected = createHmac('sha256', appConfig.sessionSecret).update(sessionId).digest('hex');
  const a = Buffer.from(signature, 'hex');
  const b = Buffer.from(expected, 'hex');
  return a.length === b.length && timingSafeEqual(a, b) ? sessionId : null;
}
