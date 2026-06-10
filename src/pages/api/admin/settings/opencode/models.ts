import type { APIRoute } from 'astro';
import { getAdminOrResponse } from '@/lib/auth';
import { listOpenCodeModels } from '@/lib/opencode-settings';

export const GET: APIRoute = async ({ cookies }) => {
  const user = await getAdminOrResponse(cookies);
  if (user instanceof Response) return user;
  if (user.role !== 'superadmin') {
    return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  }
  const result = await listOpenCodeModels();
  return Response.json(result);
};
