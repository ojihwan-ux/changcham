export const config = { runtime: 'edge' };

export default async function handler(req) {
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' }
    });
  }

  if (!KV_URL || !KV_TOKEN) {
    return new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // SCAN으로 team_ 으로 시작하는 키 전체 조회
    const scanRes = await fetch(`${KV_URL}/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['KEYS', 'team_*'])
    });
    const scanData = await scanRes.json();
    const keys = scanData.result || [];

    // 각 키에 대해 데이터 가져오기 (저장 시각 추출)
    const teams = await Promise.all(
      keys.map(async key => {
        const teamName = key.replace(/^team_/, '');
        try {
          const dataRes = await fetch(`${KV_URL}/`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(['GET', key])
          });
          const dataJson = await dataRes.json();
          let parsed = {};
          if (dataJson && dataJson.result) {
            try { parsed = JSON.parse(dataJson.result); } catch {}
          }
          return { name: teamName, savedAt: parsed._savedAt || '' };
        } catch {
          return { name: teamName, savedAt: '' };
        }
      })
    );

    return new Response(JSON.stringify(teams), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response('[]', {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
