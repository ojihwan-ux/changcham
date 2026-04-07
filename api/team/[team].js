export const config = { runtime: 'edge' };

// Upstash Redis REST API - pipeline 방식 (가장 신뢰할 수 있는 방식)
// 참고: https://upstash.com/docs/redis/features/restapi
async function kvPipeline(kvUrl, kvToken, commands) {
  const res = await fetch(`${kvUrl}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
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
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }
    });
  }

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (req.method === 'GET') {
    if (!KV_URL || !KV_TOKEN) {
      return new Response('{}', { status: 200, headers });
    }
    try {
      const results = await kvPipeline(KV_URL, KV_TOKEN, [
        ['GET', `team_${teamName}`]
      ]);
      let result = {};
      const raw = results?.[0]?.result;
      if (raw) {
        try { result = JSON.parse(raw); } catch {}
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
      // 팀 데이터 저장 + team_index SET에 팀 이름 추가 (pipeline으로 한번에)
      await kvPipeline(KV_URL, KV_TOKEN, [
        ['SET', `team_${teamName}`, bodyText],
        ['SADD', 'team_index', teamName]
      ]);
      return new Response('{"ok":true}', { headers });
    } catch {
      return new Response('{"ok":false}', { headers });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
