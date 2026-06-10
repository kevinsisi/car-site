import type { APIRoute } from 'astro';
import { getAdminOrResponse } from '@/lib/auth';
import {
  getOpenCodeStatus,
  setOpenCodeServers,
  setOpenCodeTextModel,
  setOpenCodeVisionModel,
  setOpenCodeTextVariant,
  setOpenCodeVisionVariant,
  clearOpenCodeSettings,
  OPENCODE_VARIANTS,
} from '@/lib/opencode-settings';
async function requireSuperAdmin(cookies: Parameters<APIRoute>[0]['cookies']) {
  const user = await getAdminOrResponse(cookies);
  if (user instanceof Response) return { user: null, error: user };
  if (user.role !== 'superadmin') {
    return { user: null, error: new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } }) };
  }
  return { user, error: null };
}

export const GET: APIRoute = async ({ cookies }) => {
  const { error } = await requireSuperAdmin(cookies);
  if (error) return error;
  const status = await getOpenCodeStatus();
  return Response.json({ openCode: status });
};

export const PUT: APIRoute = async ({ request, cookies }) => {
  const { error } = await requireSuperAdmin(cookies);
  if (error) return error;

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

export const DELETE: APIRoute = async ({ cookies }) => {
  const { error } = await requireSuperAdmin(cookies);
  if (error) return error;
  await clearOpenCodeSettings();
  const status = await getOpenCodeStatus();
  return Response.json({ openCode: status });
};
