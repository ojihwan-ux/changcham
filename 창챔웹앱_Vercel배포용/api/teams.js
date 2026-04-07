export const config = { runtime: 'edge' };

async function kvGet(kvUrl, kvToken, key) {
  const res = await fetch(`${kvUrl}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['GET', key])
  });
  const data = await res.json();
  return data?.result ?? null;
}

export default async function handler(req) {
  const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || process.env.KV_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_READ_ONLY_TOKEN;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
    });
  }

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (!KV_URL || !KV_TOKEN) {
    return new Response('[]', { status: 200, headers });
  }

  try {
    const listRaw = await kvGet(KV_URL, KV_TOKEN, 'all_teams');
    let teamNames = [];
    if (listRaw) { try { teamNames = JSON.parse(listRaw); } catch {} }
    if (!Array.isArray(teamNames)) teamNames = [];

    if (teamNames.length === 0) {
      return new Response('[]', { headers });
    }

    const teams = await Promise.all(
      teamNames.map(async name => {
        try {
          const raw = await kvGet(KV_URL, KV_TOKEN, `team_${name}`);
          let savedAt = '';
          if (raw) { try { savedAt = JSON.parse(raw)._savedAt || ''; } catch {} }
          return { name, savedAt };
        } catch {
          return { name, savedAt: '' };
        }
      })
    );

    return new Response(JSON.stringify(teams), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
