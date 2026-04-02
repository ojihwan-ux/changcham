export const config = { runtime: 'edge' };
export default async function handler(req) {
  return new Response(JSON.stringify({ 
    status: 'ok', 
    version: '2.0 (Vercel)', 
    hasKey: !!process.env.GEMINI_API_KEY 
  }), {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
