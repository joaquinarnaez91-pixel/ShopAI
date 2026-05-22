const https = require('https');

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6', max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });
    const r = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      timeout: 12000,
      headers: {
        'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload)
      }
    }, apiRes => {
      let d = '';
      apiRes.on('data', c => d += c);
      apiRes.on('end', () => { try { resolve(JSON.parse(d).content[0].text); } catch(e) { reject(e); } });
    });
    r.on('timeout', () => { r.destroy(); reject(new Error('timeout')); });
    r.on('error', reject);
    r.write(payload); r.end();
  });
}

function defaultEnrichment(p) {
  return {
    ...p,
    summary: '✅ Highly rated by verified buyers. ❌ Individual fit may vary.',
    insight: p.snippet || p.insight || '',
    funFact: p.brand
      ? p.brand + ' is a trusted footwear brand known for quality and performance.'
      : 'Running shoes are engineered to absorb up to 3x your body weight with every stride.'
  };
}

async function enrichOne(p) {
  const prompt = `You are reviewing ONE specific shoe: ${p.name}${p.brand ? ' by ' + p.brand : ''}, priced at $${p.price}, rated ${p.rating}.

Provide a unique, model-specific analysis for THIS exact shoe (not generic shoe advice):
1. summary: pros starting with ✅ then cons starting with ❌. Reference this model's actual known characteristics — cushioning system, weight, fit, durability, use case. Example: "✅ React foam delivers smooth heel-to-toe transitions, great for long distance. ❌ Narrow toe box, not ideal for wide feet."
2. funFact: one specific fact about this exact model or brand — a famous athlete who wears it, a technology it pioneered, a record set while wearing it, or its design origin. Must be specific, not generic.

Return ONLY a valid JSON object with no other text: {"summary":"✅ ... ❌ ...","funFact":"..."}`;

  const text = await callClaude(prompt);
  const clean = text.replace(/```json|```/g, '').trim();
  const result = JSON.parse(clean);
  return {
    ...p,
    summary: result.summary || defaultEnrichment(p).summary,
    insight: p.insight || p.snippet || '',
    funFact: result.funFact || defaultEnrichment(p).funFact
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { products } = req.body;

  if (!process.env.ANTHROPIC_API_KEY || !products || !products.length) {
    return res.status(200).json((products || []).map(defaultEnrichment));
  }

  const results = await Promise.allSettled(products.map(p => enrichOne(p)));
  const enriched = results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : defaultEnrichment(products[i])
  );

  console.log('Enrichment result:', JSON.stringify({ name: enriched[0].name, summary: enriched[0].summary }));
  return res.status(200).json(enriched);
}
