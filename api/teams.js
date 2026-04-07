export const config = { runtime: 'edge' };

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
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (!KV_URL || !KV_TOKEN) {
    return new Response(JSON.stringify({ error: 'no KV config', KV_URL: !!KV_URL, KV_TOKEN: !!KV_TOKEN }), { headers });
  }

  try {
    // 디버그: team_index SMEMBERS + KEYS team_* + KEYS * (전체 키) 동시 조회
    const debug = await kvPipeline(KV_URL, KV_TOKEN, [
      ['SMEMBERS', 'team_index'],
      ['KEYS', 'team_*'],
      ['KEYS', '*'],
      ['DBSIZE']
    ]);

    return new Response(JSON.stringify({
      smembers_team_index: debug?.[0],
      keys_team_star: debug?.[1],
      keys_all: debug?.[2],
      dbsize: debug?.[3]
    }, null, 2), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, stack: e.stack }), { status: 500, headers });
  }
}
