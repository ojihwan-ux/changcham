export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url = new URL(req.url);
  const paths = url.pathname.split('/');
  const teamName = decodeURIComponent(paths[paths.length - 1] || '');

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' }});
  }

  if (req.method === 'GET') {
    if (!KV_URL || !KV_TOKEN) {
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }
    try {
      const res = await fetch(`${KV_URL}/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(["GET", `team_${teamName}`])
      });
      const data = await res.json();
      let result = {};
      if (data && data.result) {
        try { result = JSON.parse(data.result); } catch {}
      }
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    } catch {
      return new Response('{}', { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }
  }

  if (req.method === 'POST') {
    if (!KV_URL || !KV_TOKEN) {
      return new Response('{"ok":true}', { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }
    try {
      const bodyText = await req.text(); 
      await fetch(`${KV_URL}/`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(["SET", `team_${teamName}`, bodyText])
      });
      
      // --- 구글 Docs 자동 연동 백업 파트 (Vercel 클라우드 전용) ---
      const WEBHOOK_URL = process.env.GAS_WEBHOOK_URL;
      if (WEBHOOK_URL) {
        try {
          const parsedData = JSON.parse(bodyText);
          const payload = JSON.stringify({ team_name: teamName, team_data: parsedData });
          // 구글 스크립트로 백그라운드 전송 (await하여 응답을 보장하거나 그냥 쏩니다)
          await fetch(WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload
          });
        } catch (err) {
          console.error("Google Docs Backup Error: ", err);
        }
      }
      // ----------------------------------------------------
      return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    } catch {
      return new Response('{"ok":false}', { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }});
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
