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
7. Use web search to find the most current 2026 shoe reviews, expert rankings, and model information before recommending. Search for "[shoe category] best 2026" and "[specific model] review 2026" to get current data.

RESPONSE FORMAT — CRITICAL:
Keep ALL responses under 80 words total. Be direct. Be confident. NEVER write paragraphs. Short = better. The cards will show the details.

WHEN READY TO RECOMMEND use this exact format:
"Here are your top picks 👇

🥇 [Brand] [Model] — $[price]. [One sentence why.]
🥈 [Brand] [Model] — $[price]. [One sentence why.]
🥉 [Brand] [Model] — $[price]. [One sentence why.]

My pick for you: [Model] — [one sentence reason].

What's next?
🔍 Compare these  |  💰 Lower budget  |  🏆 More premium  |  🎨 Specific color  |  👟 Different brand"

Then end with SEARCH_MODELS JSON on its own line. Include 5-6 models in the array.

ENGAGEMENT RULES:
- After showing recommendations always offer next steps on one line (as above)
- If user says "compare" → compare top 2-3 shoes in 3 bullet points max per shoe
- If user says "more options" → show 3 new models not previously mentioned
- If user says "lower budget" → ask what budget then show cheaper options
- If user says "more premium" → show aspirational options above original budget
- If user says "specific color" → ask which color then refine search
- If user says "different brand" → ask which brand they like then focus there
- If user pins a shoe → acknowledge it: "Good taste — [model] pinned to your shortlist 📌"
- Always end responses with: 🔍 Compare these  |  💰 Lower budget  |  🏆 More premium  |  🎨 Specific color  |  👟 Different brand
- Keep every response under 80 words total including the options line`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { messages, system } = req.body;

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: system || SYSTEM_PROMPT,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    tool_choice: { type: 'auto' },
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
        'anthropic-beta': 'web-search-2025-03-05',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, apiRes => {
      let d = '';
      apiRes.on('data', c => d += c);
      apiRes.on('end', () => {
        try {
          const body = JSON.parse(d);
          if (!body.content || !body.content.length) {
            console.error('[chat] Unexpected API response:', d.slice(0, 300));
            res.status(502).json({ error: 'Invalid response from AI' });
          } else {
            const textBlocks = body.content
              .filter(block => block.type === 'text')
              .map(block => block.text)
              .join('\n');
            if (!textBlocks) {
              console.error('[chat] No text blocks in response:', JSON.stringify(body.content).slice(0, 300));
              res.status(502).json({ error: 'Invalid response from AI' });
            } else {
              res.status(200).json({ content: textBlocks });
            }
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
