import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { getAdminOrResponse } from '@/lib/auth';
import type { OpenCodeStatus } from '@/lib/opencode-settings';

async function requireSuperAdmin(cookies: Parameters<APIRoute>[0]['cookies'], locals: Parameters<APIRoute>[0]['locals']) {
  const runtimeEnv = locals.runtime?.env;
  if (locals.runtime && (!runtimeEnv?.DB_PREVIEW || !runtimeEnv.SESSION_SECRET)) {
    return { user: null, error: new Response(JSON.stringify({ error: 'preview bindings unavailable' }), { status: 503, headers: { 'content-type': 'application/json' } }) };
  }
  const adapter = runtimeEnv?.DB_PREVIEW ? await createD1Db(runtimeEnv.DB_PREVIEW) : undefined;
  const authOptions = {
    ...(adapter ? { db: adapter } : {}),
    ...(runtimeEnv?.SESSION_SECRET ? { sessionSecret: runtimeEnv.SESSION_SECRET } : {}),
  };
  const user = await getAdminOrResponse(cookies, authOptions);
  if (user instanceof Response) return { user: null, error: user };
  if (user.role !== 'superadmin') {
    return { user: null, error: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } }) };
  }
  return { user, error: null };
}

function previewStatus(): OpenCodeStatus {
  return {
    servers: [], serversSource: 'none', envUrl: '',
    textModel: '', textModelSource: 'none', visionModel: '', visionModelSource: 'none',
    textVariant: 'medium', textVariantSource: 'none', visionVariant: 'medium', visionVariantSource: 'none',
  };
}

export const GET: APIRoute = async ({ cookies, locals }) => {
  const { error } = await requireSuperAdmin(cookies, locals);
  if (error) return error;
  if (locals.runtime) return Response.json({ openCode: previewStatus() });
  const { getOpenCodeStatus } = await import('@/lib/opencode-settings');
  const status = await getOpenCodeStatus();
  return Response.json({ openCode: status });
};

export const PUT: APIRoute = async ({ request, cookies, locals }) => {
  const { error } = await requireSuperAdmin(cookies, locals);
  if (error) return error;
  if (locals.runtime) return new Response(JSON.stringify({ error: 'OpenCode settings are disabled in preview' }), { status: 403, headers: { 'content-type': 'application/json' } });
  const { setOpenCodeServers, setOpenCodeTextModel, setOpenCodeVisionModel, setOpenCodeTextVariant, setOpenCodeVisionVariant, getOpenCodeStatus, OPENCODE_VARIANTS } = await import('@/lib/opencode-settings');

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  const tasks: Promise<void>[] = [];

  if ('servers' in body) {
    tasks.push(setOpenCodeServers(body.servers));
  }
  if ('textModel' in body) {
    tasks.push(setOpenCodeTextModel(String(body.textModel ?? '')));
  }
  if ('visionModel' in body) {
    tasks.push(setOpenCodeVisionModel(String(body.visionModel ?? '')));
  }
  if ('textVariant' in body) {
    const v = String(body.textVariant ?? '');
    if (v && !OPENCODE_VARIANTS.includes(v as typeof OPENCODE_VARIANTS[number])) {
      return new Response(JSON.stringify({ error: `invalid textVariant: ${v}` }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    tasks.push(setOpenCodeTextVariant(v));
  }
  if ('visionVariant' in body) {
    const v = String(body.visionVariant ?? '');
    if (v && !OPENCODE_VARIANTS.includes(v as typeof OPENCODE_VARIANTS[number])) {
      return new Response(JSON.stringify({ error: `invalid visionVariant: ${v}` }), { status: 400, headers: { 'content-type': 'application/json' } });
    }
    tasks.push(setOpenCodeVisionVariant(v));
  }

  if (tasks.length === 0) {
    return new Response(JSON.stringify({ error: 'no fields provided' }), { status: 400, headers: { 'content-type': 'application/json' } });
  }

  await Promise.all(tasks);
  const status = await getOpenCodeStatus();
  return Response.json({ openCode: status });
};

export const DELETE: APIRoute = async ({ cookies, locals }) => {
  const { error } = await requireSuperAdmin(cookies, locals);
  if (error) return error;
  if (locals.runtime) return new Response(JSON.stringify({ error: 'OpenCode settings are disabled in preview' }), { status: 403, headers: { 'content-type': 'application/json' } });
  const { clearOpenCodeSettings, getOpenCodeStatus } = await import('@/lib/opencode-settings');
  await clearOpenCodeSettings();
  const status = await getOpenCodeStatus();
  return Response.json({ openCode: status });
};
