export const config = { runtime: 'edge' };

// Upstash Redis REST API - pipeline 방식
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
    // Step 1: team_index SET에서 팀 이름 목록 가져오기
    const step1 = await kvPipeline(KV_URL, KV_TOKEN, [
      ['SMEMBERS', 'team_index']
    ]);
    let teamNames = step1?.[0]?.result || [];

    // team_index가 비어 있으면 KEYS로 폴백 (기존 데이터 복구)
    if (!Array.isArray(teamNames) || teamNames.length === 0) {
      const step1b = await kvPipeline(KV_URL, KV_TOKEN, [
        ['KEYS', 'team_*']
      ]);
      const rawKeys = step1b?.[0]?.result || [];
      teamNames = rawKeys
        .filter(k => k !== 'team_index')
        .map(k => k.replace(/^team_/, ''));

      // 발견한 팀들을 team_index에 등록
      if (teamNames.length > 0) {
        await kvPipeline(KV_URL, KV_TOKEN, [
          ['SADD', 'team_index', ...teamNames]
        ]);
      }
    }

    if (teamNames.length === 0) {
      return new Response('[]', { headers });
    }

    // Step 2: 각 팀 데이터에서 savedAt 추출
    const getCommands = teamNames.map(name => ['GET', `team_${name}`]);
    const step2 = await kvPipeline(KV_URL, KV_TOKEN, getCommands);

    const teams = teamNames.map((name, i) => {
      let savedAt = '';
      try {
        const raw = step2?.[i]?.result;
        if (raw) {
          const parsed = JSON.parse(raw);
          savedAt = parsed._savedAt || '';
        }
      } catch {}
      return { name, savedAt };
    });

    return new Response(JSON.stringify(teams), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
  }
}
