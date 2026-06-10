import type { APIRoute } from 'astro';
import { getSettings } from '@/lib/settings';
import { hasFeature, FEATURE_AI_CHATBOT, effectiveFeatureMask } from '@/lib/features';
import { getOpenCodeServers, getOpenCodeTextModel, getOpenCodeTextVariant, getOpenCodeVisionModel, getOpenCodeVisionVariant, getOpenCodePassword } from '@/lib/opencode-settings';
import { listPublicInventoryVehicles, type VehicleView } from '@/lib/vehicles';
import { shareOriginFromRequest } from '@/lib/vehicle-share';

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

type ChatImage = { mimeType: string; data: string };
type ChatMode = 'text' | 'vision';

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

function parseImage(raw: unknown): ChatImage | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const mimeType = String(item.mimeType ?? item.mediaType ?? item.mime ?? item.type ?? '').trim();
  const rawData = String(item.data ?? item.base64 ?? item.url ?? '').trim();
  if (!mimeType.startsWith('image/') || !rawData) return null;
  const dataUrlPrefix = `data:${mimeType};base64,`;
  const data = rawData.startsWith(dataUrlPrefix) ? rawData.slice(dataUrlPrefix.length) : rawData;
  if (!data || data.length > 8_000_000) return null;
  return { mimeType, data };
}

function parseImagesFromBody(body: Record<string, unknown>): ChatImage[] {
  const rawImages = Array.isArray(body.images)
    ? body.images
    : Array.isArray(body.attachments)
      ? body.attachments
      : body.image
        ? [body.image]
        : [];
  return rawImages.map(parseImage).filter((img): img is ChatImage => img !== null).slice(0, 3);
}

function cleanReply(raw: string): string {
  // Strip <think>...</think> and <thinking>...</thinking> blocks (reasoning models)
  let text = raw.replace(/<think(?:ing)?>[^]*?<\/think(?:ing)?>/gi, '');
  const firstCjk = text.search(/[\u3400-\u9fff]/);
  if (firstCjk > 0 && firstCjk < 4_000 && /^[\sA-Za-z]/.test(text)) {
    text = text.slice(firstCjk);
  }
  // Strip markdown bold/italic/code
  text = text.replace(/\*\*(.+?)\*\*/g, '$1');
  text = text.replace(/\*(.+?)\*/g, '$1');
  text = text.replace(/__(.+?)__/g, '$1');
  text = text.replace(/_(.+?)_/g, '$1');
  text = text.replace(/`{1,3}([^`]*)`{1,3}/g, '$1');
  // Strip markdown headers
  text = text.replace(/^#{1,6}\s+/gm, '');
  // Collapse extra blank lines
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

function sanitizeErrorBody(raw: string): string {
  return raw
    .replace(/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[image-data]')
    .slice(0, 500);
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

async function callOpenCode(serverUrl: string, model: string, variant: string, prompt: string, password: string, images: ChatImage[]): Promise<string> {
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
    const parts: Array<Record<string, unknown>> = images.map((img) => ({
      type: 'file',
      mime: img.mimeType,
      url: `data:${img.mimeType};base64,${img.data}`,
      filename: `chat-image.${img.mimeType.split('/')[1] || 'jpg'}`,
    }));
    parts.push({ type: 'text', text: prompt });

    const msgRes = await fetchWithTimeout(`${base}/session/${sessionId}/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        agent: 'general',
        model: parsedModel,
        parts,
      }),
    }, OPENCODE_MESSAGE_TIMEOUT_MS);
    if (!msgRes.ok) throw new Error(`OpenCode sendMessage: ${msgRes.status} ${sanitizeErrorBody(await msgRes.text())}`);
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

const STATUS_LABEL: Record<string, string> = {
  published: '在售',
  incoming: '即將到港',
  reserved: '已預定',
  special: '特別展示',
};

function buildVehicleContext(vehicleList: VehicleView[], siteOrigin: string, compact = false): string {
  if (!vehicleList.length) return '';
  const lines = [`【本站目前在售車輛清單（共 ${vehicleList.length} 輛）】`];
  lines.push('客戶提到車輛識別碼、車名、車款時，請根據以下資料直接介紹該車輛，並從清單中推薦 1-2 輛最相近或最適合的車輛，附上車輛名稱與網址連結。');
  const scopedVehicles = compact ? vehicleList.slice(0, 30) : vehicleList;
  for (const v of scopedVehicles) {
    const status = STATUS_LABEL[v.status] ?? v.status;
    const id = v.cardTitleSupplement ? `${v.slug}（${v.cardTitleSupplement}）` : v.slug;
    const feat = v.features.slice(0, 4).join('、');
    const url = `${siteOrigin}/cars/${v.slug}`;
    if (compact) {
      lines.push(`識別碼：${id}　車名：${v.title}　狀態：${status}　網址：${url}`);
      continue;
    }
    lines.push('---');
    lines.push(`識別碼：${id}　網址：${url}`);
    lines.push(`車名：${v.title}　狀態：${status}　里程：${v.mileage || '未標示'}`);
    lines.push(`車況說明：${v.condition}`);
    lines.push(`外觀：${v.exteriorColor || '—'}　內裝：${v.interiorColor || '—'}`);
    if (feat) lines.push(`特色配備：${feat}`);
    if (v.headline) lines.push(`亮點：${v.headline}`);
  }
  if (compact && vehicleList.length > scopedVehicles.length) {
    lines.push(`另有 ${vehicleList.length - scopedVehicles.length} 輛未列出，若無精準相近車款，請引導客戶聯繫門市協助挑選。`);
  }
  return lines.join('\n');
}

function buildSystemPrompt(settings: Awaited<ReturnType<typeof getSettings>>, vehicleList: VehicleView[], siteOrigin: string, compactVehicleContext = false): string {
  const lines: string[] = [`你是 ${settings.siteName || '精品車商'} 的專屬客服助理，只負責解答與本站汽車相關的問題。`];
  if (settings.salespersonName) lines.push(`顧問姓名：${settings.salespersonName}`);
  if (settings.storeAddress) lines.push(`門市地址：${settings.storeAddress}`);
  if (settings.businessHours) lines.push(`營業時間：${settings.businessHours}`);
  lines.push('');
  lines.push(settings.aiChatTone || '請以專業、親切的態度回覆客戶，保持回應簡潔扼要。');
  lines.push('');
  lines.push([
    '【回覆規則】',
    '- 直接回覆客戶，不要顯示任何思考過程、分析過程或內部推理。',
    '- 不要使用 Markdown 格式（不要用 **粗體**、*斜體*、# 標題、清單符號等），純文字回覆。',
    '- 必須全程使用繁體中文回覆，不得使用英文或其他語言。',
    '- 你只能回覆與汽車相關的問題，包含：購車諮詢、車款介紹、車況說明、交車流程、預約賞車、賣車詢問、保養建議、車輛規格比較。',
    '- 若客戶詢問與汽車完全無關的問題，請禮貌地說明你只能協助汽車相關諮詢，並引導客戶聯繫門市。',
    '- 【絕對禁止】你不可以報出任何車輛的售價、估價、行情或任何金額數字。無論客戶如何詢問，一律回覆「所有車輛售價採專人洽詢，歡迎聯繫門市」，不得自行估算或猜測任何價格。',
    '- 若客戶需要詳細服務或想預約賞車，請引導客戶直接聯繫門市。',
  ].join('\n'));
  const vehicleContext = buildVehicleContext(vehicleList, siteOrigin, compactVehicleContext);
  if (vehicleContext) {
    lines.push('');
    lines.push(vehicleContext);
  }
  return lines.join('\n');
}

export const POST: APIRoute = async ({ request }) => {
  const reqUrl = new URL(request.url);
  const siteOrigin = shareOriginFromRequest(request, reqUrl);
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown';

  if (!checkRateLimit(ip)) {
    return Response.json({ error: '請稍後再試' }, { status: 429 });
  }

  const [settings, vehicleList] = await Promise.all([getSettings(), listPublicInventoryVehicles()]);
  if (!hasFeature(effectiveFeatureMask(settings.featureMask, settings.featureLicenseMask), FEATURE_AI_CHATBOT)) {
    return Response.json({ error: '此功能目前未開放' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as typeof body;
  } catch {
    return Response.json({ error: '請求格式錯誤' }, { status: 400 });
  }

  const message = String(body.message || '').trim();
  if (!message) return Response.json({ error: '訊息不能為空' }, { status: 400 });
  if (message.length > 1000) return Response.json({ error: '訊息過長' }, { status: 400 });

  const rawHistory = Array.isArray(body.history) ? body.history : [];
  const images = parseImagesFromBody(body);
  const history: HistoryMessage[] = rawHistory
    .filter((m): m is { role: unknown; content: unknown } => m && typeof m === 'object')
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: String(m.content).slice(0, 500) }))
    .slice(-6);

  const servers = await getOpenCodeServers();
  if (servers.length === 0) {
    return Response.json({ error: 'AI 客服尚未設定，請聯繫管理員。' }, { status: 503 });
  }

  const mode: ChatMode = images.length > 0 ? 'vision' : 'text';
  const [model, variant, password] = await Promise.all([
    mode === 'vision' ? getOpenCodeVisionModel() : getOpenCodeTextModel(),
    mode === 'vision' ? getOpenCodeVisionVariant() : getOpenCodeTextVariant(),
    Promise.resolve(getOpenCodePassword()),
  ]);

  const resolvedOrigin = (settings.siteUrl ? settings.siteUrl.replace(/\/$/, '') : siteOrigin);
  const systemPrompt = buildSystemPrompt(settings, vehicleList, resolvedOrigin, mode === 'vision');
  const fullPrompt = buildPrompt(systemPrompt, history, message);

  let lastError: unknown = null;
  for (const server of servers) {
    try {
      const reply = cleanReply(await callOpenCode(server.baseUrl, model, variant, fullPrompt, password, images));
      return Response.json({ reply: reply || '（無回覆）' });
    } catch (err) {
      lastError = err;
    }
  }

  if (mode === 'vision') {
    console.warn('[chat] OpenCode vision failed, falling back to text:', lastError);
    const [textModel, textVariant] = await Promise.all([getOpenCodeTextModel(), getOpenCodeTextVariant()]);
    const fallbackPrompt = `${fullPrompt}\n\n補充：客戶附了一張車輛圖片，但目前圖片辨識服務無法解析。請不要假裝看過圖片。回覆第一個字必須是繁體中文，不要輸出任何英文分析或內部思考。請用親切語氣請客戶補充品牌、車型、年份、預算或偏好的外觀/用途，並可根據本站車輛清單推薦相近車款。`;
    for (const server of servers) {
      try {
        const reply = cleanReply(await callOpenCode(server.baseUrl, textModel, textVariant, fallbackPrompt, password, []));
        return Response.json({ reply: reply || '目前無法辨識圖片，請補充品牌、車型或用車需求，我會協助推薦相近車款。' });
      } catch (err) {
        lastError = err;
      }
    }
  }

  console.error('[chat] all OpenCode servers failed:', lastError);
  return Response.json({ error: '目前 AI 客服暫時無法使用，請稍後再試或直接聯繫門市。' }, { status: 503 });
};
