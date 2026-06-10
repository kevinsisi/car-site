import type { APIRoute } from 'astro';
import { getSettings } from '@/lib/settings';
import { hasFeature, FEATURE_AI_CHATBOT, effectiveFeatureMask } from '@/lib/features';
import { getOpenCodeServers, getOpenCodeTextModel, getOpenCodeTextVariant, getOpenCodePassword } from '@/lib/opencode-settings';

// Rate limit: 20 messages per minute per IP
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 1000;
const OPENCODE_CREATE_TIMEOUT_MS = 10_000;
const OPENCODE_MESSAGE_TIMEOUT_MS = 120_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count += 1;
  return true;
}

function authHeaders(password: string): Record<string, string> {
  if (!password) return {};
  return { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` };
}

function splitModel(model: string): { providerID: string; modelID: string } {
  const idx = model.indexOf('/');
  if (idx === -1) return { providerID: 'opencode', modelID: model };
  return { providerID: model.slice(0, idx), modelID: model.slice(idx + 1) };
}

function parseTextFromBody(body: unknown): string {
  if (Array.isArray(body)) {
    return body
      .filter((e): e is { type: string; value: string } => e?.type === 'text' && typeof e?.value === 'string')
      .map((e) => e.value)
      .join('');
  }
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    if (obj.type === 'text' && typeof obj.value === 'string') return obj.value;
    if (Array.isArray(obj.parts)) {
      return (obj.parts as Array<{ text?: string }>).map((p) => p?.text ?? '').join('');
    }
  }
  return '';
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenCode(serverUrl: string, model: string, variant: string, prompt: string, password: string): Promise<string> {
  const base = serverUrl.replace(/\/$/, '');
  const headers = { 'Content-Type': 'application/json', ...authHeaders(password) };
  const parsedModel = splitModel(model);

  const createRes = await fetchWithTimeout(`${base}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      title: 'car-site AI concierge',
      agent: 'general',
      model: { providerID: parsedModel.providerID, id: parsedModel.modelID, variant },
    }),
  }, OPENCODE_CREATE_TIMEOUT_MS);

  if (!createRes.ok) throw new Error(`OpenCode createSession: ${createRes.status}`);
  const sessionData = (await createRes.json()) as { id?: string };
  const sessionId = sessionData.id;
  if (!sessionId) throw new Error('OpenCode createSession returned no session id');

  let text = '';
  try {
    const msgRes = await fetchWithTimeout(`${base}/session/${sessionId}/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        agent: 'general',
        model: parsedModel,
        parts: [{ type: 'text', text: prompt }],
      }),
    }, OPENCODE_MESSAGE_TIMEOUT_MS);
    if (!msgRes.ok) throw new Error(`OpenCode sendMessage: ${msgRes.status}`);
    text = parseTextFromBody(await msgRes.json());
  } finally {
    fetchWithTimeout(`${base}/session/${sessionId}`, { method: 'DELETE', headers: authHeaders(password) }, 10_000).catch(() => {});
  }
  return text;
}

type HistoryMessage = { role: 'user' | 'assistant'; content: string };

function buildPrompt(systemPrompt: string, history: HistoryMessage[], message: string): string {
  const parts: string[] = [systemPrompt, ''];
  for (const msg of history.slice(-6)) {
    parts.push(msg.role === 'user' ? `Customer: ${msg.content}` : `Assistant: ${msg.content}`);
  }
  parts.push(`Customer: ${message}`);
  parts.push('Assistant:');
  return parts.join('\n');
}

function buildSystemPrompt(settings: Awaited<ReturnType<typeof getSettings>>): string {
  const lines: string[] = [`你是 ${settings.siteName || '精品車商'} 的專屬客服助理，只負責解答與本站汽車相關的問題。`];
  if (settings.salespersonName) lines.push(`顧問姓名：${settings.salespersonName}`);
  if (settings.storeAddress) lines.push(`門市地址：${settings.storeAddress}`);
  if (settings.businessHours) lines.push(`營業時間：${settings.businessHours}`);
  lines.push('');
  lines.push(settings.aiChatTone || '請以專業、親切的態度回覆客戶，保持回應簡潔扼要。');
  lines.push('');
  lines.push([
    '【重要限制】',
    '- 你只能回覆與汽車相關的問題，包含：購車諮詢、車款介紹、車況說明、交車流程、預約賞車、賣車詢問、保養建議、車輛規格比較。',
    '- 若客戶詢問與汽車完全無關的問題（例如：天氣、料理、投資、政治、其他商品等），請禮貌地說明你只能協助汽車相關諮詢，並引導客戶聯繫門市。',
    '- 【絕對禁止】你不可以報出任何車輛的售價、估價、行情或任何金額數字。無論客戶如何詢問，一律回覆「所有車輛售價採專人洽詢，歡迎聯繫門市」，不得自行估算或猜測任何價格。',
    '- 若客戶詢問特定車輛庫存或需要詳細服務，請引導客戶直接聯繫門市。',
    '- 請使用繁體中文回覆。',
  ].join('\n'));
  return lines.join('\n');
}

export const POST: APIRoute = async ({ request }) => {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return Response.json({ error: '請稍後再試' }, { status: 429 });
  }

  const settings = await getSettings();
  if (!hasFeature(effectiveFeatureMask(settings.featureMask, settings.featureLicenseMask), FEATURE_AI_CHATBOT)) {
    return Response.json({ error: '此功能目前未開放' }, { status: 403 });
  }

  let body: { message?: unknown; history?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const message = String(body.message || '').trim();
  if (!message) return Response.json({ error: '訊息不能為空' }, { status: 400 });
  if (message.length > 1000) return Response.json({ error: '訊息過長' }, { status: 400 });

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const history: HistoryMessage[] = rawHistory
    .filter((m): m is { role: unknown; content: unknown } => m && typeof m === 'object')
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 500) }))
    .slice(-6);

  const servers = await getOpenCodeServers();
  if (servers.length === 0) {
    return Response.json({ error: 'AI 客服尚未設定，請聯繫管理員。' }, { status: 503 });
  }

  const [model, variant, password] = await Promise.all([
    getOpenCodeTextModel(),
    getOpenCodeTextVariant(),
    Promise.resolve(getOpenCodePassword()),
  ]);

  const systemPrompt = buildSystemPrompt(settings);
  const fullPrompt = buildPrompt(systemPrompt, history, message);

  let lastError: unknown = null;
  for (const server of servers) {
    try {
      const reply = await callOpenCode(server.baseUrl, model, variant, fullPrompt, password);
      return Response.json({ reply: reply.trim() || '（無回覆）' });
    } catch (err) {
      lastError = err;
    }
  }

  console.error('[chat] all OpenCode servers failed:', lastError);
  return Response.json({ error: '目前 AI 客服暫時無法使用，請稍後再試或直接聯繫門市。' }, { status: 503 });
};
