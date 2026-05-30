import type { APIRoute } from 'astro';

export const GET: APIRoute = () => {
  return Response.json({ ok: true, service: 'car-site' });
};
