export const config = { runtime: 'edge' };
export default async function handler(req) {
  const kvVars = Object.keys(process.env).filter(k =>
    k.includes('KV') || k.includes('UPSTASH') || k.includes('REDIS')
  );
  return new Response(JSON.stringify({
    status: 'ok',
    version: '2.0 (Vercel)',
    hasKey: !!process.env.GEMINI_API_KEY,
    kvEnvVars: kvVars
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
