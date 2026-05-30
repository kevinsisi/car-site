import type { APIRoute } from 'astro';
import { ADMIN_COOKIE, createSession } from '@/lib/auth';

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const form = await request.formData();
  const username = String(form.get('username') || '');
  const password = String(form.get('password') || '');
  const session = await createSession(username, password);
  if (!session) return redirect('/admin/login?error=1');
  cookies.set(ADMIN_COOKIE, session.cookieValue, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: import.meta.env.PROD,
    expires: new Date(session.expiresAt),
  });
  return redirect('/admin');
};
