export const config = { runtime: 'edge' };

export default async function handler(req) {
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };

  const info = {
    hasKvUrl: !!KV_URL,
    hasKvToken: !!KV_TOKEN,
    kvUrlPrefix: KV_URL ? KV_URL.substring(0, 30) + '...' : null,
    envKeys: Object.keys(process.env).filter(k => k.startsWith('KV') || k.startsWith('UPSTASH'))
  };

  if (!KV_URL || !KV_TOKEN) {
    return new Response(JSON.stringify({ status: 'NO_KV_CONFIG', info }), { headers });
  }

  // KV에 실제로 쓰고 읽기 테스트
  try {
    // write test
    const writeRes = await fetch(`${KV_URL}/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['SET', 'kv_test', 'hello'])
    });
    const writeData = await writeRes.json();

    // read test
    const readRes = await fetch(`${KV_URL}/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', 'kv_test'])
    });
    const readData = await readRes.json();

    // all_teams 읽기
    const allTeamsRes = await fetch(`${KV_URL}/`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(['GET', 'all_teams'])
    });
    const allTeamsData = await allTeamsRes.json();

    return new Response(JSON.stringify({
      status: 'OK',
      info,
      writeResult: writeData,
      readResult: readData,
      allTeams: allTeamsData
    }, null, 2), { headers });
  } catch (e) {
    return new Response(JSON.stringify({ status: 'ERROR', error: e.message, info }), { headers });
  }
}
