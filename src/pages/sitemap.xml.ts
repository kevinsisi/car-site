import type { APIRoute } from 'astro';
import { createD1Db } from '@/db/d1';
import { listPublicVehicles } from '@/lib/vehicles';

export const GET: APIRoute = async ({ url, locals }) => {
  const runtime = locals.runtime;
  const env = runtime?.env as { DB_PREVIEW?: Parameters<typeof createD1Db>[0] } | undefined;
  if (runtime && !env?.DB_PREVIEW) {
    return new Response('Database unavailable', { status: 503 });
  }

  const origin = `${url.protocol}//${url.host}`;
  const adapter = env?.DB_PREVIEW ? await createD1Db(env.DB_PREVIEW) : undefined;
  const vehicles = await listPublicVehicles(adapter);
  const staticPaths = ['/', '/cars', '/about', '/contact'];
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const path of staticPaths) {
    lines.push('  <url>');
    lines.push(`    <loc>${origin}${path}</loc>`);
    lines.push('    <changefreq>weekly</changefreq>');
    lines.push(`    <priority>${path === '/' ? '1.0' : '0.8'}</priority>`);
    lines.push('  </url>');
  }
  for (const vehicle of vehicles) {
    lines.push('  <url>');
    lines.push(`    <loc>${origin}/cars/${vehicle.slug}</loc>`);
    lines.push('    <changefreq>weekly</changefreq>');
    lines.push('    <priority>0.7</priority>');
    lines.push('  </url>');
  }
  lines.push('</urlset>');
  return new Response(lines.join('\n'), {
    headers: { 'content-type': 'application/xml; charset=utf-8' },
  });
};
