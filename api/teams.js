export const config = { runtime: 'edge' };

function getKvCredentials() {
  let url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  let token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url && process.env.REDIS_URL) {
    try {
      const parsed = new URL(process.env.REDIS_URL);
      url = `https://${parsed.hostname}`;
      token = parsed.password;
    } catch {}
  }
  return { url, token };
}

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
  const { url: KV_URL, token: KV_TOKEN } = getKvCredentials();

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
    // all_teams 키에서 팀 이름 목록 가져오기 (GET/SET만 사용)
    const listRaw = await kvGet(KV_URL, KV_TOKEN, 'all_teams');
    let teamNames = [];
    if (listRaw) { try { teamNames = JSON.parse(listRaw); } catch {} }
    if (!Array.isArray(teamNames)) teamNames = [];

    if (teamNames.length === 0) {
      return new Response('[]', { headers });
    }

    // 각 팀의 저장 시각 조회
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
