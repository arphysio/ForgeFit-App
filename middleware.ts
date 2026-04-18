import { createServerClient } from '@supabase/ssr';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextRequest, NextResponse } from 'next/server';

let workoutLimiter: Ratelimit | null = null;
let youtubeLimiter: Ratelimit | null = null;

function hasUsableRedisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? '';
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? '';
  const looksPlaceholder =
    !url ||
    !token ||
    url.includes('your_upstash_url_here') ||
    token.includes('your_upstash_token_here');
  return !looksPlaceholder && url.startsWith('https://');
}

function getLimiters() {
  if (!hasUsableRedisEnv()) return null;
  if (workoutLimiter && youtubeLimiter) {
    return { workoutLimiter, youtubeLimiter };
  }

  const redis = Redis.fromEnv();
  workoutLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1 h'),
    prefix: 'forgefit:workout',
    analytics: true,
  });
  youtubeLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, '1 h'),
    prefix: 'forgefit:youtube',
    analytics: true,
  });
  return { workoutLimiter, youtubeLimiter };
}

function isAuthPage(pathname: string) {
  return (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/join' ||
    pathname.startsWith('/auth/')
  );
}

/** App pages that require a signed-in user */
function requiresAuth(pathname: string) {
  if (pathname.startsWith('/api')) return false;
  if (pathname === '/forgefit-complete.html') return false;
  if (isAuthPage(pathname)) return false;
  if (pathname === '/') return true;
  if (pathname.startsWith('/program-builder')) return true;
  if (pathname.startsWith('/messages')) return true;
  if (pathname.startsWith('/calendar')) return true;
  if (pathname.startsWith('/patient')) return true;
  return false;
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach(({ name, value }) => {
    to.cookies.set(name, value);
  });
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    });

    const AUTH_LOOKUP_MS = 8000;
    let user = null;
    try {
      const result = await Promise.race([
        supabase.auth.getUser(),
        new Promise<{ data: { user: null } }>((_, reject) =>
          setTimeout(() => reject(new Error('auth lookup timeout')), AUTH_LOOKUP_MS)
        ),
      ]);
      user = result.data?.user ?? null;
    } catch {
      user = null;
    }

    if (user && (pathname === '/login' || pathname === '/signup')) {
      const next = request.nextUrl.searchParams.get('redirect');
      const safe =
        next && next.startsWith('/') && !next.startsWith('//')
          ? next
          : pathname === '/signup'
            ? '/patient'
            : '/';
      const home = new URL(safe, request.url);
      const redirect = NextResponse.redirect(home);
      copyCookies(supabaseResponse, redirect);
      return redirect;
    }

    if (requiresAuth(pathname) && !user) {
      const login = new URL('/login', request.url);
      login.searchParams.set('redirect', `${pathname}${request.nextUrl.search}`);
      const redirect = NextResponse.redirect(login);
      copyCookies(supabaseResponse, redirect);
      return redirect;
    }
  }

  const isWorkout = pathname === '/api/workout';
  const isYouTube = pathname === '/api/youtube';

  if (!isWorkout && !isYouTube) {
    return supabaseResponse;
  }

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    '127.0.0.1';

  let selectedLimiter: Ratelimit | null = null;
  try {
    const limiters = getLimiters();
    if (!limiters) {
      return supabaseResponse;
    }
    selectedLimiter = isWorkout ? limiters.workoutLimiter : limiters.youtubeLimiter;
  } catch {
    return supabaseResponse;
  }

  const identifier = `ip:${ip}`;
  let success: boolean;
  let limit: number;
  let remaining: number;
  let reset: number;
  try {
    ({ success, limit, remaining, reset } = await selectedLimiter.limit(identifier));
  } catch {
    return supabaseResponse;
  }

  const headers = new Headers();
  headers.set('X-RateLimit-Limit', String(limit));
  headers.set('X-RateLimit-Remaining', String(remaining));
  headers.set('X-RateLimit-Reset', String(reset));

  if (!success) {
    const retryAfterSec = Math.ceil((reset - Date.now()) / 1000);
    headers.set('Retry-After', String(retryAfterSec));

    const denied = NextResponse.json(
      {
        error: 'Too many requests. Please wait before generating another workout.',
        retryAfterSeconds: retryAfterSec,
      },
      { status: 429, headers }
    );
    copyCookies(supabaseResponse, denied);
    return denied;
  }

  const apiResponse = NextResponse.next({ request });
  copyCookies(supabaseResponse, apiResponse);
  headers.forEach((value, key) => apiResponse.headers.set(key, value));
  return apiResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|forgefit-complete\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
