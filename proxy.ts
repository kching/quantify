import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export const proxy = auth((request) => {
  if (request.nextUrl.pathname.startsWith('/api/auth/')) return NextResponse.next();
  if (request.auth) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  return NextResponse.redirect(new URL('/', request.url));
});

export const config = {
  matcher: ['/dashboard/:path*', '/research/:path*', '/api/:path*'],
};
