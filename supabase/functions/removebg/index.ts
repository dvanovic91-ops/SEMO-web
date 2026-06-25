// ============================================================
//  remove.bg 프록시 — SKU 제품 이미지 배경 자동 제거
//  - REMOVEBG_API_KEY 를 서버 환경변수에서만 사용
//  - 클라이언트에서 이미지 binary 를 POST → 배경 제거된 PNG 반환
// ============================================================

const ALLOWED_ORIGINS = new Set([
  'https://semo-box.com',
  'https://www.semo-box.com',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  const apiKey = Deno.env.get('REMOVEBG_API_KEY');
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'removebg_not_configured' }), {
      status: 500,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: getCorsHeaders(req) });
  }

  let imageBlob: Blob;
  try {
    imageBlob = await req.blob();
    if (!imageBlob.size) throw new Error('empty');
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_body' }), {
      status: 400,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const form = new FormData();
  form.append('image_file', imageBlob, 'image.jpg');
  form.append('size', 'auto');

  const rbgRes = await fetch('https://api.remove.bg/v1.0/removebg', {
    method: 'POST',
    headers: { 'X-Api-Key': apiKey },
    body: form,
  });

  if (!rbgRes.ok) {
    const errText = await rbgRes.text();
    return new Response(errText, {
      status: rbgRes.status,
      headers: { ...getCorsHeaders(req), 'Content-Type': 'application/json' },
    });
  }

  const pngBuffer = await rbgRes.arrayBuffer();
  return new Response(pngBuffer, {
    status: 200,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'image/png',
    },
  });
});
