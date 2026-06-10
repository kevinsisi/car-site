/**
 * opencode-settings.ts — DB-backed OpenCode configuration.
 *
 * Follows the HomeProject OpenCode Settings UI Contract (opencode-settings-ui-contract.md).
 * Ported from auto-social/packages/server/src/opencode-settings.ts, adapted for
 * Drizzle async access (no db parameter — uses module-level siteSettings table).
 *
 * Settings stored in site_settings table (same key-value store):
 *   openCode.servers       — JSON array of { id, label, baseUrl }
 *   openCode.textModel     — model id, e.g. "openai/gpt-5.5"
 *   openCode.textVariant   — "default" | "medium" | "high"
 *   openCode.visionModel   — model id for vision calls
 *   openCode.visionVariant — "default" | "medium" | "high"
 *
 * Server password intentionally NOT a UI setting — env-only via OPENCODE_SERVER_PASSWORD.
 */

import { getSettingValue, setSettingValue, deleteSettingValue } from './settings';

const SETTING_SERVERS        = 'openCode.servers';
const SETTING_TEXT_MODEL     = 'openCode.textModel';
const SETTING_VISION_MODEL   = 'openCode.visionModel';
const SETTING_TEXT_VARIANT   = 'openCode.textVariant';
const SETTING_VISION_VARIANT = 'openCode.visionVariant';

export const DEFAULT_OPENCODE_TEXT_MODEL   = 'openai/gpt-5.5';
export const DEFAULT_OPENCODE_VISION_MODEL = 'openai/gpt-5.5';
export const DEFAULT_OPENCODE_TEXT_VARIANT   = 'medium' as const;
export const DEFAULT_OPENCODE_VISION_VARIANT = 'medium' as const;
export const OPENCODE_VARIANTS = ['default', 'medium', 'high'] as const;
export type OpenCodeVariant = (typeof OPENCODE_VARIANTS)[number];

export type OpenCodeServer = {
  id: string;
  label: string;
  baseUrl: string;
};

export type OpenCodeSettingSource = 'setting' | 'env' | 'none';

export type OpenCodeStatus = {
  servers: OpenCodeServer[];
  serversSource: OpenCodeSettingSource;
  envUrl: string;
  textModel: string;
  textModelSource: OpenCodeSettingSource;
  visionModel: string;
  visionModelSource: OpenCodeSettingSource;
  textVariant: OpenCodeVariant;
  textVariantSource: OpenCodeSettingSource;
  visionVariant: OpenCodeVariant;
  visionVariantSource: OpenCodeSettingSource;
};

export type OpenCodeModel = {
  id: string;
  name: string;
  provider: string;
};

export type OpenCodeModelsResult = {
  models: OpenCodeModel[];
  sourceServerId: string | null;
  warning: string | null;
};

function trimUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function normalizeServer(raw: unknown, index: number): OpenCodeServer | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const baseUrl = trimUrl(String(item.baseUrl ?? item.url ?? ''));
  if (!baseUrl) return null;
  const id    = String(item.id    ?? '').trim() || `opencode-${index + 1}`;
  const label = String(item.label ?? '').trim() || `OpenCode ${index + 1}`;
  return { id, label, baseUrl };
}

function parseServersValue(raw: unknown): OpenCodeServer[] {
  if (Array.isArray(raw)) {
    return raw.map(normalizeServer).filter((s): s is OpenCodeServer => s !== null);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parseServersValue(parsed);
    } catch {
      // fall through to delimiter parsing
    }
    return trimmed
      .split(/[\n,]+/)
      .map((url, index) => normalizeServer({ baseUrl: url }, index))
      .filter((s): s is OpenCodeServer => s !== null);
  }
  return [];
}

function readEnvServers(): OpenCodeServer[] {
  const envServers = process.env.OPENCODE_SERVERS;
  if (envServers?.trim()) return parseServersValue(envServers);
  const legacyUrl = trimUrl(process.env.OPENCODE_URL ?? process.env.OPENCODE_BASE_URL ?? '');
  if (!legacyUrl) return [];
  return [{ id: 'opencode-env', label: 'OpenCode (env)', baseUrl: legacyUrl }];
}

function normalizeVariant(raw: unknown): OpenCodeVariant | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return OPENCODE_VARIANTS.includes(trimmed as OpenCodeVariant) ? (trimmed as OpenCodeVariant) : null;
}

async function readJsonSetting(key: string): Promise<unknown> {
  const raw = await getSettingValue(key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function writeJsonSetting(key: string, value: unknown): Promise<void> {
  await setSettingValue(key, JSON.stringify(value));
}

export async function getOpenCodeServers(): Promise<OpenCodeServer[]> {
  const fromSetting = parseServersValue(await readJsonSetting(SETTING_SERVERS));
  if (fromSetting.length > 0) return fromSetting;
  return readEnvServers();
}

export async function setOpenCodeServers(raw: unknown): Promise<void> {
  const normalized = parseServersValue(raw);
  if (normalized.length === 0) {
    await deleteSettingValue(SETTING_SERVERS);
    return;
  }
  await writeJsonSetting(SETTING_SERVERS, normalized);
}

export async function getOpenCodeTextModel(): Promise<string> {
  const fromSetting = await readJsonSetting(SETTING_TEXT_MODEL);
  if (typeof fromSetting === 'string' && fromSetting.trim()) return fromSetting.trim();
  return process.env.OPENCODE_MODEL?.trim() || DEFAULT_OPENCODE_TEXT_MODEL;
}

export async function setOpenCodeTextModel(model: string): Promise<void> {
  const trimmed = model.trim();
  if (!trimmed) { await deleteSettingValue(SETTING_TEXT_MODEL); return; }
  await writeJsonSetting(SETTING_TEXT_MODEL, trimmed);
}

export async function getOpenCodeVisionModel(): Promise<string> {
  const fromSetting = await readJsonSetting(SETTING_VISION_MODEL);
  if (typeof fromSetting === 'string' && fromSetting.trim()) return fromSetting.trim();
  return process.env.OPENCODE_VISION_MODEL?.trim() || DEFAULT_OPENCODE_VISION_MODEL;
}

export async function setOpenCodeVisionModel(model: string): Promise<void> {
  const trimmed = model.trim();
  if (!trimmed) { await deleteSettingValue(SETTING_VISION_MODEL); return; }
  await writeJsonSetting(SETTING_VISION_MODEL, trimmed);
}

export async function getOpenCodeTextVariant(): Promise<OpenCodeVariant> {
  return normalizeVariant(await readJsonSetting(SETTING_TEXT_VARIANT))
    ?? normalizeVariant(process.env.OPENCODE_TEXT_VARIANT)
    ?? DEFAULT_OPENCODE_TEXT_VARIANT;
}

export async function setOpenCodeTextVariant(raw: string): Promise<void> {
  const variant = normalizeVariant(raw);
  if (!variant) { await deleteSettingValue(SETTING_TEXT_VARIANT); return; }
  await writeJsonSetting(SETTING_TEXT_VARIANT, variant);
}

export async function getOpenCodeVisionVariant(): Promise<OpenCodeVariant> {
  return normalizeVariant(await readJsonSetting(SETTING_VISION_VARIANT))
    ?? normalizeVariant(process.env.OPENCODE_VISION_VARIANT)
    ?? DEFAULT_OPENCODE_VISION_VARIANT;
}

export async function setOpenCodeVisionVariant(raw: string): Promise<void> {
  const variant = normalizeVariant(raw);
  if (!variant) { await deleteSettingValue(SETTING_VISION_VARIANT); return; }
  await writeJsonSetting(SETTING_VISION_VARIANT, variant);
}

export async function clearOpenCodeSettings(): Promise<void> {
  await Promise.all([
    deleteSettingValue(SETTING_SERVERS),
    deleteSettingValue(SETTING_TEXT_MODEL),
    deleteSettingValue(SETTING_VISION_MODEL),
    deleteSettingValue(SETTING_TEXT_VARIANT),
    deleteSettingValue(SETTING_VISION_VARIANT),
  ]);
}

export function getOpenCodePassword(): string {
  return process.env.OPENCODE_SERVER_PASSWORD ?? '';
}

export async function getOpenCodeStatus(): Promise<OpenCodeStatus> {
  const [
    rawServers, rawTextModel, rawVisionModel, rawTextVariant, rawVisionVariant,
  ] = await Promise.all([
    readJsonSetting(SETTING_SERVERS),
    readJsonSetting(SETTING_TEXT_MODEL),
    readJsonSetting(SETTING_VISION_MODEL),
    readJsonSetting(SETTING_TEXT_VARIANT),
    readJsonSetting(SETTING_VISION_VARIANT),
  ]);

  const fromSetting = parseServersValue(rawServers);
  const envServers  = readEnvServers();
  const servers       = fromSetting.length > 0 ? fromSetting : envServers;
  const serversSource: OpenCodeSettingSource = fromSetting.length > 0 ? 'setting' : envServers.length > 0 ? 'env' : 'none';
  const envUrl = envServers[0]?.baseUrl ?? '';

  const textFromSetting = typeof rawTextModel === 'string' && rawTextModel.trim() ? rawTextModel.trim() : null;
  const textFromEnv     = process.env.OPENCODE_MODEL?.trim() || null;
  const textModel       = textFromSetting ?? textFromEnv ?? DEFAULT_OPENCODE_TEXT_MODEL;
  const textModelSource: OpenCodeSettingSource = textFromSetting ? 'setting' : textFromEnv ? 'env' : 'none';

  const visionFromSetting = typeof rawVisionModel === 'string' && rawVisionModel.trim() ? rawVisionModel.trim() : null;
  const visionFromEnv     = process.env.OPENCODE_VISION_MODEL?.trim() || null;
  const visionModel       = visionFromSetting ?? visionFromEnv ?? DEFAULT_OPENCODE_VISION_MODEL;
  const visionModelSource: OpenCodeSettingSource = visionFromSetting ? 'setting' : visionFromEnv ? 'env' : 'none';

  const textVariantFromSetting = normalizeVariant(rawTextVariant);
  const textVariantFromEnv     = normalizeVariant(process.env.OPENCODE_TEXT_VARIANT);
  const textVariant            = textVariantFromSetting ?? textVariantFromEnv ?? DEFAULT_OPENCODE_TEXT_VARIANT;
  const textVariantSource: OpenCodeSettingSource = textVariantFromSetting ? 'setting' : textVariantFromEnv ? 'env' : 'none';

  const visionVariantFromSetting = normalizeVariant(rawVisionVariant);
  const visionVariantFromEnv     = normalizeVariant(process.env.OPENCODE_VISION_VARIANT);
  const visionVariant            = visionVariantFromSetting ?? visionVariantFromEnv ?? DEFAULT_OPENCODE_VISION_VARIANT;
  const visionVariantSource: OpenCodeSettingSource = visionVariantFromSetting ? 'setting' : visionVariantFromEnv ? 'env' : 'none';

  return {
    servers, serversSource, envUrl,
    textModel, textModelSource,
    visionModel, visionModelSource,
    textVariant, textVariantSource,
    visionVariant, visionVariantSource,
  };
}

function authHeaders(password: string): Record<string, string> {
  if (!password) return {};
  return { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` };
}

async function fetchOpenCodeProviders(baseUrl: string, password: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${baseUrl}/provider`, {
      headers: authHeaders(password),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function flattenProviders(raw: unknown): OpenCodeModel[] {
  const providers: Array<{ id?: unknown; models?: unknown }> = Array.isArray(raw)
    ? (raw as Array<{ id?: unknown; models?: unknown }>)
    : Array.isArray((raw as { all?: unknown[] })?.all)
      ? ((raw as { all: Array<{ id?: unknown; models?: unknown }> }).all)
      : [];
  const out: OpenCodeModel[] = [];
  for (const provider of providers) {
    const pid = typeof provider.id === 'string' ? provider.id : '';
    const modelMap = provider.models;
    if (!pid || !modelMap || typeof modelMap !== 'object' || Array.isArray(modelMap)) continue;
    for (const [modelId, info] of Object.entries(modelMap as Record<string, unknown>)) {
      const name =
        info && typeof info === 'object' && typeof (info as { name?: unknown }).name === 'string'
          ? (info as { name: string }).name
          : modelId;
      out.push({ id: `${pid}/${modelId}`, name, provider: pid });
    }
  }
  return out;
}

export async function listOpenCodeModels(): Promise<OpenCodeModelsResult> {
  const servers = await getOpenCodeServers();
  if (servers.length === 0) {
    return { models: [], sourceServerId: null, warning: '尚未設定 OpenCode server。' };
  }
  const password = getOpenCodePassword();
  let lastError: unknown = null;
  for (const server of servers) {
    try {
      const raw = await fetchOpenCodeProviders(server.baseUrl, password);
      const models = flattenProviders(raw);
      if (models.length > 0) return { models, sourceServerId: server.id, warning: null };
    } catch (err) {
      lastError = err;
    }
  }
  const detail = lastError instanceof Error ? lastError.message.slice(0, 160) : null;
  return {
    models: [],
    sourceServerId: null,
    warning: detail ?? '無法從任何已設定的 OpenCode server 取得 model 列表。',
  };
}
