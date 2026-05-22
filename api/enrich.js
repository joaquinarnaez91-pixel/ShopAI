const https = require('https');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { products } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const names = products.map((p, i) => (i+1) + '. ' + p.name + ' ($' + p.price + ', rated ' + p.rating + ')').join('\n');
  const prompt = 'For each of these shoe products provide: (1) a summary with pros starting with ✅ and cons starting with ❌ (e.g. "✅ Excellent arch support, durable outsole. ❌ Runs narrow, limited colors."), and (2) a funFact — one sentence about a famous athlete, world record, or interesting technology behind the shoe. If you have no specific fact about that exact shoe, generate a plausible general fact about the brand or shoe category instead (e.g. "Brooks has been making running shoes since 1914 and is trusted by podiatrists worldwide."). Never leave funFact empty. Respond ONLY with a JSON array: [{"summary":"✅ ... ❌ ...","funFact":"..."}]\n\n' + names;

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6', max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });

  const fallback = () => res.status(200).json(
    products.map(p => ({ ...p, summary: '✅ Highly rated by verified buyers. ❌ Individual fit may vary.', insight: p.snippet, funFact: p.brand ? p.brand + ' is a trusted footwear brand known for quality and performance.' : 'Running shoes are engineered to absorb up to 3x your body weight with every stride.' }))
  );

  try {
    const r = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json', 'x-api-key': apiKey,
        'anthropic-version': '2023-06-01', 'Content-Length': Buffer.byteLength(payload)
      }
    }, apiRes => {
      let d = '';
      apiRes.on('data', c => d += c);
      apiRes.on('end', () => {
        try {
          const text = JSON.parse(d).content[0].text;
          const enriched = JSON.parse(text.replace(/```json|```/g, '').trim());
          console.log('Enrichment result:', JSON.stringify(enriched[0]));
          res.status(200).json(products.map((p, i) => ({
            ...p,
            summary: enriched[i] ? enriched[i].summary : '✅ Highly rated by verified buyers. ❌ Individual fit may vary.',
            insight: enriched[i] ? enriched[i].insight || p.snippet : p.snippet,
            funFact: enriched[i] ? (enriched[i].funFact || (p.brand ? p.brand + ' is a trusted footwear brand known for quality and performance.' : 'Running shoes are engineered to absorb up to 3x your body weight with every stride.')) : ''
          })));
        } catch(e) { fallback(); }
      });
    });
    r.on('timeout', () => { r.destroy(); });
    r.on('error', fallback);
    r.write(payload);
    r.end();
  } catch(e) { fallback(); }
}
