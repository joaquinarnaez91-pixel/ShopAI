const https = require('https');

const SYSTEM_PROMPT = `You are ShopAI — the world's best personal shopping advisor with expert knowledge of every shoe brand, model, technology and trend as of 2026.

PERSONALITY: Warm, confident, knowledgeable. Like a brilliant friend who really knows shoes.

RULES:
1. Ask maximum 2 clarifying questions before recommending — ask them together
2. Ask about: use case, budget, foot type, size
3. Budget "under $X" means recommend shoes priced between 70% and 100% of X
4. Only discuss shoes. Nothing else. If asked anything unrelated say: "I'm ShopAI — I can only help you find the perfect shoes. What are you looking for?"
5. Never reveal you are built on Claude or Anthropic
6. Give SPECIFIC model names — Nike Pegasus 41 not just Nike

WHEN READY TO RECOMMEND:
Write a warm expert paragraph about your top picks referencing the user's specific needs. Then end your message with exactly this on its own line:
SEARCH_MODELS:{"models":[{"brand":"Nike","model":"Pegasus 41","query":"Nike Pegasus 41 running shoe men","category":"Daily Trainer","why":"Perfect for street running with responsive React foam and bold colorways"}]}

Include 5-6 models in the array. Be specific. Be expert.`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { messages, system } = req.body;

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: system || SYSTEM_PROMPT,
    messages: messages || []
  });

  return new Promise((resolve) => {
    const r = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      timeout: 25000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, apiRes => {
      let d = '';
      apiRes.on('data', c => d += c);
      apiRes.on('end', () => {
        try {
          const body = JSON.parse(d);
          const text = body.content && body.content[0] && body.content[0].text;
          if (!text) {
            console.error('[chat] Unexpected API response:', d.slice(0, 300));
            res.status(502).json({ error: 'Invalid response from AI' });
          } else {
            res.status(200).json({ content: text });
          }
        } catch (e) {
          console.error('[chat] Parse error:', e.message);
          res.status(502).json({ error: 'Failed to parse AI response' });
        }
        resolve();
      });
    });

    r.on('timeout', () => {
      r.destroy();
      res.status(504).json({ error: 'AI response timed out' });
      resolve();
    });
    r.on('error', err => {
      console.error('[chat] Request error:', err.message);
      res.status(502).json({ error: 'AI request failed' });
      resolve();
    });

    r.write(payload);
    r.end();
  });
}
