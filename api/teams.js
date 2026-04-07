export const config = { runtime: 'edge' };

// 원래 동작하던 Upstash 단일 커맨드 방식
async function kvCmd(kvUrl, kvToken, command) {
  const res = await fetch(`${kvUrl}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
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
    let teamNames = [];

    // 1단계: team_index SET에서 팀 이름 목록 (신규 저장된 팀들)
    const indexData = await kvCmd(KV_URL, KV_TOKEN, ['SMEMBERS', 'team_index']);
    const indexMembers = indexData?.result || [];
    if (Array.isArray(indexMembers) && indexMembers.length > 0) {
      teamNames = indexMembers;
    }

    // 2단계: SCAN으로 team_* 키 검색 (기존 데이터 복구)
    // SCAN cursor MATCH pattern COUNT count
    const scanData = await kvCmd(KV_URL, KV_TOKEN, ['SCAN', '0', 'MATCH', 'team_*', 'COUNT', '200']);
    const scanResult = scanData?.result;
    // SCAN 결과: [nextCursor, [key1, key2, ...]]
    if (Array.isArray(scanResult) && Array.isArray(scanResult[1])) {
      const scannedKeys = scanResult[1]
        .filter(k => k !== 'team_index')
        .map(k => k.replace(/^team_/, ''));
      
      // 중복 제거하여 합치기
      const allNames = new Set([...teamNames, ...scannedKeys]);
      teamNames = [...allNames];

      // 기존 데이터를 team_index에도 등록 (다음번부터는 SMEMBERS로 빠르게)
      if (scannedKeys.length > 0) {
        await kvCmd(KV_URL, KV_TOKEN, ['SADD', 'team_index', ...scannedKeys]);
      }
    }

    if (teamNames.length === 0) {
      return new Response('[]', { headers });
    }

    // 3단계: 각 팀의 저장 시각 조회
    const teams = await Promise.all(
      teamNames.map(async name => {
        try {
          const d = await kvCmd(KV_URL, KV_TOKEN, ['GET', `team_${name}`]);
          let savedAt = '';
          if (d?.result) {
            try { savedAt = JSON.parse(d.result)._savedAt || ''; } catch {}
          }
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
