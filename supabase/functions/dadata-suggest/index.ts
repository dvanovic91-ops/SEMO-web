// ============================================================
//  DaData 주소 자동완성 프록시
//  - DaData API 키를 서버 환경변수에서만 사용 (클라이언트 노출 없음)
//  - IP당 분당 120회 rate limit
// ============================================================

const ALLOWED_ORIGINS = new Set([
  'https://semo-box.com',
  'http://localhost:5173',
  'http://localhost:3001',
]);

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://semo-box.com';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

function json(res: object, status = 200, req: Request) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// ── Rate limiter (IP당 분당 120회) ──
const rlStore = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string, maxPerMinute = 120): boolean {
  const now = Date.now();
  const entry = rlStore.get(ip);
  if (!entry || now > entry.resetAt) {
    rlStore.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= maxPerMinute) return true;
  entry.count++;
  return false;
}

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  const dadataToken = Deno.env.get('DADATA_API_KEY');
  if (!dadataToken) {
    return json({ error: 'dadata_not_configured' }, 500, req);
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip, 120)) {
    return json({ error: 'rate_limited' }, 429, req);
  }

  let query: string;
  let count = 5;
  try {
    const body = await req.json();
    query = typeof body.query === 'string' ? body.query.trim() : '';
    if (typeof body.count === 'number') count = Math.min(body.count, 10);
  } catch {
    return json({ error: 'invalid_json' }, 400, req);
  }

  if (!query || query.length < 2) {
    return json({ suggestions: [] }, 200, req);
  }

  try {
    const res = await fetch('https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/address', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Token ${dadataToken}`,
      },
      body: JSON.stringify({ query, count }),
    });

    if (!res.ok) {
      return json({ suggestions: [] }, 200, req);
    }

    const data = await res.json();
    return json({ suggestions: data.suggestions ?? [] }, 200, req);
  } catch {
    return json({ suggestions: [] }, 200, req);
  }
});
