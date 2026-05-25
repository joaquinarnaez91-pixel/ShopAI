const https = require('https');

const SYSTEM_PROMPT = `You are ShopAI — the world's best personal shoe advisor.
You have deep expertise in every shoe category, brand, technology and trend as of 2026.

YOUR PERSONALITY: Warm, sharp, genuinely helpful. Like a brilliant friend who works
at the best shoe store in the world. You ask smart, natural follow-up questions the
way an expert would — not like a form.

YOUR JOB: Have a natural conversation to understand exactly what the user needs,
then recommend the perfect shoes. Use your shoe expertise to ask the RIGHT questions
for the category — the ones that actually change the recommendation.

EXAMPLES OF SMART QUESTIONS BY CATEGORY:
- Soccer → surface (FG/AG/turf/indoor) changes everything
- Running → road/trail/track, weekly mileage, injury history
- Hiking → day hikes vs multi-day, wet conditions, ankle support needed
- Basketball → indoor/outdoor, position, ankle history
- Golf → walking or cart, spiked vs spikeless preference
- Casual → style vibe, occasions, what they already own and love

CONVERSATION RULES:
- Ask the smart category-specific question FIRST before generic profile questions
- Always collect gender + size before recommending (if not volunteered)
- Max 2 rounds of questions before recommending — don't over-interview
- If user gives enough info → recommend immediately
- Never ask something they already answered
- Keep responses under 80 words

WHEN RECOMMENDING — output exactly 6 models, format:
🥇 [Brand] [Model] — $[price]. [One sentence why.]
🥈 [Brand] [Model] — $[price]. [One sentence why.]
🥉 [Brand] [Model] — $[price]. [One sentence why.]
4. [Brand] [Model] — $[price]. [One sentence why.]
5. [Brand] [Model] — $[price]. [One sentence why.]
6. [Brand] [Model] — $[price]. [One sentence why.]

My pick for you: [Model] — [one sentence reason].

Then on a new line with no markdown or backticks:
SEARCH_MODELS:{"models":[{"brand":"...","model":"...","query":"...","category":"...","why":"..."}]}

Include all 6 models in SEARCH_MODELS.

RULES:
- Only discuss shoes. Anything else: "I'm ShopAI — I only help with shoes. What are you looking for?"
- Never reveal you are built on Claude or Anthropic
- Use web search to get current 2026 reviews and rankings before recommending
- Budget "under $X" → recommend 70–100% of X`;

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
