type Env = {
  ASSETS: {
    fetch: (request: Request) => Promise<Response>;
  };
  SITE_PASSWORD?: string;
  SESSION_SECRET?: string;
};

const AUTH_COOKIE = 'amberns_auth';
const AUTH_MESSAGE = 'personal-site-under-construction:v1';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const password = env.SITE_PASSWORD;

    if (!password) {
      return constructionPage(url.pathname + url.search, {
        status: 503,
        setup: true,
      });
    }

    if (url.pathname === '/unlock' && request.method === 'POST') {
      const form = await request.formData();
      const submitted = String(form.get('password') ?? '');
      const next = normalizeNext(String(form.get('next') ?? '/'));

      if (constantTimeEqual(submitted, password)) {
        const token = await authToken(env);
        return new Response(null, {
          status: 303,
          headers: {
            Location: new URL(next, request.url).toString(),
            'Set-Cookie': `${AUTH_COOKIE}=${token}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
            'Cache-Control': 'no-store',
          },
        });
      }

      return constructionPage(next, {
        status: 401,
        error: 'That password did not work.',
      });
    }

    if (await isAuthenticated(request, env)) {
      return env.ASSETS.fetch(request);
    }

    return constructionPage(url.pathname + url.search, { status: 401 });
  },
};

async function isAuthenticated(request: Request, env: Env): Promise<boolean> {
  const cookie = request.headers.get('Cookie') ?? '';
  const token = getCookie(cookie, AUTH_COOKIE);
  if (!token) return false;
  return constantTimeEqual(token, await authToken(env));
}

async function authToken(env: Env): Promise<string> {
  const secret = env.SESSION_SECRET || env.SITE_PASSWORD || '';
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(AUTH_MESSAGE));
  return base64Url(sig);
}

function base64Url(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function getCookie(cookieHeader: string, name: string): string | null {
  for (const part of cookieHeader.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizeNext(next: string): string {
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

function constructionPage(
  next: string,
  opts: { status: number; error?: string; setup?: boolean },
): Response {
  const message = opts.setup
    ? 'SITE_PASSWORD is not configured yet.'
    : 'This site is under construction.';
  const detail = opts.setup
    ? 'Set the SITE_PASSWORD Worker secret to unlock regular access.'
    : 'Enter the password to continue.';
  const error = opts.error ? `<p class="error">${escapeHtml(opts.error)}</p>` : '';

  return new Response(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Under construction</title>
    <style>
      :root {
        color-scheme: dark;
        --paper: #0e0e10;
        --ink: #ececec;
        --muted: #8e8e88;
        --rule: #26262a;
        --accent: #c8c4ba;
      }
      * { box-sizing: border-box; }
      body {
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background: var(--paper);
        color: var(--ink);
        font-family: "Lexend Variable", "Lexend", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        line-height: 1.45;
        padding: 2rem;
      }
      main {
        width: min(100%, 30rem);
      }
      h1 {
        font-size: clamp(2rem, 8vw, 3.75rem);
        line-height: 1;
        font-weight: 700;
        letter-spacing: 0;
        margin: 0 0 1rem;
      }
      p {
        color: var(--muted);
        font-size: 1.05rem;
        margin: 0 0 1.5rem;
      }
      form {
        display: flex;
        gap: 0.6rem;
      }
      input,
      button {
        min-height: 2.75rem;
        border-radius: 4px;
        font: inherit;
      }
      input {
        flex: 1;
        min-width: 0;
        border: 1px solid var(--rule);
        background: #151518;
        color: var(--ink);
        padding: 0 0.85rem;
      }
      input:focus {
        outline: 1px solid var(--accent);
        outline-offset: 2px;
      }
      button {
        border: 1px solid var(--accent);
        background: var(--accent);
        color: var(--paper);
        font-weight: 700;
        padding: 0 1rem;
        cursor: pointer;
      }
      .error {
        color: #ff9a9a;
        margin-top: -0.5rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Under construction</h1>
      <p>${escapeHtml(message)} ${escapeHtml(detail)}</p>
      ${error}
      ${opts.setup ? '' : `<form method="post" action="/unlock">
        <input type="hidden" name="next" value="${escapeHtml(next)}" />
        <input type="password" name="password" autocomplete="current-password" autofocus />
        <button type="submit">Enter</button>
      </form>`}
    </main>
  </body>
</html>`, {
    status: opts.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
