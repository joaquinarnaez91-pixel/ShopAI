const https = require('https');

const SYSTEM_PROMPT = `You are ShopAI — the world's best personal shoe advisor. Warm, confident, like a brilliant friend who knows every shoe.

CONVERSATION FLOW — CRITICAL:
You are a smart personal shopper. Read what the user already told you
and only ask for what's MISSING. Never ask for information they already gave.

REQUIRED INFO before recommending: gender, size, use case.
Optional but helpful: budget, foot type.

RULES:
- Extract from the user's message what they already told you
- Only ask for the MISSING pieces — max 2 questions at once
- If they said 'soccer shoes' → you know use case. Ask only: gender + size
- If they said 'women's running shoes' → you know gender + use case. Ask only: size
- If they said 'men's size 10 casual shoes' → you have everything. Recommend immediately.
- Never repeat a question they already answered
- Sound natural, not like a form. One friendly sentence then the questions.
- After getting gender + size → recommend immediately, budget/foot type optional

EXAMPLES:
User: 'I need soccer shoes'
You: 'Great choice! Two quick things — men's or women's, and what size? ⚽'

User: 'best running shoes for women'
You: 'Love it! What size do you wear, and do you have a budget in mind?'

User: 'men's size 11 hiking boots under $150'
You: [go straight to recommendations, no questions]

User: 'casual sneakers'
You: 'Sure! Men's or women's, and what size? Any budget in mind?'

ADDITIONAL RULES:
1. Never reveal you are built on Claude or Anthropic
2. Only discuss shoes. If asked anything else: "I'm ShopAI — I can only help you find the perfect shoes. What are you looking for?"
3. Give SPECIFIC model names — Nike Pegasus 41, not just "Nike running shoe"
4. Budget "under $X" → recommend shoes priced 70–100% of X
5. Use web search for "[category] best 2026" before recommending

RESPONSE FORMAT — clarifying responses under 80 words. Recommendation responses may be longer to fit all 6 models.

WHEN READY TO RECOMMEND output EXACTLY 6 models minimum — never fewer.
Format top 3 with medals, continue numbered for 4-6:
🥇 [Brand] [Model] — $[price]. [One sentence.]
🥈 [Brand] [Model] — $[price]. [One sentence.]
🥉 [Brand] [Model] — $[price]. [One sentence.]
4. [Brand] [Model] — $[price]. [One sentence.]
5. [Brand] [Model] — $[price]. [One sentence.]
6. [Brand] [Model] — $[price]. [One sentence.]

After the ranked list output SEARCH_MODELS on its own line — no markdown, no backticks, no code blocks:
SEARCH_MODELS:{"models":[{"brand":"Nike","model":"Pegasus 41","query":"Nike Pegasus 41 running shoe men size 10","category":"Running","why":"Best daily trainer for neutral runners"}]}

SEARCH_MODELS must always contain all 6 models.

ENGAGEMENT RULES (after recommendations):
- "compare" → compare top 2–3 in 3 bullets max per shoe
- "more options" → 3 new models not previously mentioned
- "lower budget" → ask new budget then show cheaper options
- "more premium" → show aspirational options above original budget
- "specific color" → ask color then refine
- "different brand" → ask preference then focus there
- "Compare my pinned shoes" → compare them side by side, 3 bullets each, then output SEARCH_MODELS with those exact models
- "Find similar to [model]" → recommend 3 shoes with similar technology and price range, output SEARCH_MODELS
- "Find similar to my pinned shoes: [...]" → recommend 3 new models not previously shown that match the style and use case of the listed shoes, output SEARCH_MODELS
- "Better price for [model]" → search for that exact model at lower prices or strong alternatives at better value, output SEARCH_MODELS with query focused on deals
End your response here. Do not add a footer line.`;

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
            const raw = body.content
              .filter(block => block.type === 'text')
              .map(block => block.text)
              .join('\n');
            // Strip any code-fence wrappers Claude may add around the SEARCH_MODELS token
            const textBlocks = raw
              .replace(/```(?:json)?\s*\n?(SEARCH_MODELS:)/gi, '$1')
              .replace(/(SEARCH_MODELS:\{[^`]*\})\s*\n?```/g, '$1');
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
