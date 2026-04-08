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

async function kvSet(kvUrl, kvToken, key, value) {
  await fetch(`${kvUrl}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(['SET', key, value])
  });
}

export default async function handler(req) {
  const url = new URL(req.url);
  const paths = url.pathname.split('/');
  const teamName = decodeURIComponent(paths[paths.length - 1] || '');

  const { url: KV_URL, token: KV_TOKEN } = getKvCredentials();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }});
  }

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  if (req.method === 'GET') {
    if (!KV_URL || !KV_TOKEN) return new Response('{}', { status: 200, headers });
    try {
      const raw = await kvGet(KV_URL, KV_TOKEN, `team_${teamName}`);
      let result = {};
      if (raw) { try { result = JSON.parse(raw); } catch {} }
      return new Response(JSON.stringify(result), { headers });
    } catch {
      return new Response('{}', { headers });
    }
  }

  if (req.method === 'POST') {
    if (!KV_URL || !KV_TOKEN) return new Response('{"ok":true}', { status: 200, headers });
    try {
      const bodyText = await req.text();

      // 1) 팀 데이터 저장
      await kvSet(KV_URL, KV_TOKEN, `team_${teamName}`, bodyText);

      // 2) 팀 목록(all_teams) 업데이트
      const listRaw = await kvGet(KV_URL, KV_TOKEN, 'all_teams');
      let allTeams = [];
      if (listRaw) { try { allTeams = JSON.parse(listRaw); } catch {} }
      if (!Array.isArray(allTeams)) allTeams = [];
      if (!allTeams.includes(teamName)) {
        allTeams.push(teamName);
        await kvSet(KV_URL, KV_TOKEN, 'all_teams', JSON.stringify(allTeams));
      }

      // 3) 구글 Docs 자동 연동 백업 (GAS 웹훅)
      const WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;
      if (WEBHOOK_URL) {
        try {
          const parsedData = JSON.parse(bodyText);
          const payload = JSON.stringify({ team_name: teamName, team_data: parsedData });
          await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            redirect: 'follow'
          });
        } catch (err) {
          console.error('Google Docs Backup Error:', err);
        }
      }

      return new Response('{"ok":true}', { headers });
    } catch {
      return new Response('{"ok":false}', { headers });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
