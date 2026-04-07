export const config = { runtime: 'edge' };

// 원래 동작하던 Upstash 단일 커맨드 방식 유지
async function kvCmd(kvUrl, kvToken, command) {
  const res = await fetch(`${kvUrl}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  return res.json();
}

export default async function handler(req) {
  const url = new URL(req.url);
  const paths = url.pathname.split('/');
  const teamName = decodeURIComponent(paths[paths.length - 1] || '');

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }});
  }

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (req.method === 'GET') {
    if (!KV_URL || !KV_TOKEN) {
      return new Response('{}', { status: 200, headers });
    }
    try {
      const data = await kvCmd(KV_URL, KV_TOKEN, ['GET', `team_${teamName}`]);
      let result = {};
      if (data && data.result) {
        try { result = JSON.parse(data.result); } catch {}
      }
      return new Response(JSON.stringify(result), { headers });
    } catch {
      return new Response('{}', { headers });
    }
  }

  if (req.method === 'POST') {
    if (!KV_URL || !KV_TOKEN) {
      return new Response('{"ok":true}', { status: 200, headers });
    }
    try {
      const bodyText = await req.text();
      // 팀 데이터 저장 (원래 방식 유지)
      await kvCmd(KV_URL, KV_TOKEN, ['SET', `team_${teamName}`, bodyText]);
      // team_index SET에 팀 이름 추가 (목록 조회용)
      await kvCmd(KV_URL, KV_TOKEN, ['SADD', 'team_index', teamName]);
      return new Response('{"ok":true}', { headers });
    } catch {
      return new Response('{"ok":false}', { headers });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
