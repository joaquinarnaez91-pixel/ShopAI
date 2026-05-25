const https = require('https');

function fallback(product) {
  return {
    expertTake: `${product.brand} ${product.name} is a well-regarded shoe in the ${product.category} category.`,
    prosSummary: 'Highly rated by verified buyers for comfort and performance.',
    consSummary: 'Individual fit may vary — try before buying if possible.',
    funFact: `${product.brand} has been making performance footwear trusted by athletes worldwide.`,
    technology: ['Performance foam', 'Engineered upper', 'Durable outsole'],
    scores: { comfort: 80, value: 75, style: 80, fitMatch: 80 },
    bestDealReason: `Currently available at ${product.source} with competitive pricing.`
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { product, userProfile } = req.body;

  if (!product || !product.name) {
    return res.status(400).json({ error: 'product is required' });
  }

  const prompt = `You are a shoe expert. Generate deep dive content for this specific shoe.

SHOE: ${product.brand} ${product.name}
PRICE: $${product.price}
CATEGORY: ${product.category}
WHY RECOMMENDED: ${product.why || 'Great match for this user'}
USER PROFILE: ${JSON.stringify(userProfile || {})}

Return ONLY a valid JSON object with these exact fields — no markdown, no explanation:

{
  "expertTake": "2-3 sentences. Warm and specific. Reference why this shoe suits this user.",
  "prosSummary": "One sentence on what buyers consistently love",
  "consSummary": "One honest sentence on the main limitation",
  "funFact": "One fascinating sentence — famous athlete, world record, technology origin, or cultural moment",
  "technology": ["tech feature 1", "tech feature 2", "tech feature 3"],
  "scores": {
    "comfort": 85,
    "value": 78,
    "style": 90,
    "fitMatch": 88
  },
  "bestDealReason": "Short sentence on why the current store is the best option"
}`;

  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }]
  });

  return new Promise((resolve) => {
    const r = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      timeout: 20000,
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
          const text = JSON.parse(d).content[0].text;
          const clean = text.replace(/```json|```/g, '').trim();
          const enriched = JSON.parse(clean);
          console.log('[enrich]', product.brand, product.name, '— scores:', JSON.stringify(enriched.scores));
          res.status(200).json({ ...enriched, _source: 'claude' });
        } catch (e) {
          console.error('[enrich] Parse failed for', product.name + ':', e.message);
          res.status(200).json({ ...fallback(product), _source: 'fallback' });
        }
        resolve();
      });
    });

    r.on('timeout', () => {
      r.destroy();
      console.error('[enrich] Timeout for', product.name);
      res.status(200).json({ ...fallback(product), _source: 'fallback' });
      resolve();
    });
    r.on('error', err => {
      console.error('[enrich] Request error:', err.message);
      res.status(200).json({ ...fallback(product), _source: 'fallback' });
      resolve();
    });

    r.write(payload);
    r.end();
  });
}
