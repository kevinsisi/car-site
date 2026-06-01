import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ url }) => {
  const origin = `${url.protocol}//${url.host}`;
  const body = [
    'User-agent: *',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /api/',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
  return new Response(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
};
