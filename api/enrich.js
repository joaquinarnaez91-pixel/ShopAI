const https = require('https');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { products } = req.body;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  const names = products.map((p, i) => (i+1) + '. ' + p.name + ' ($' + p.price + ', rated ' + p.rating + ')').join('\n');
  const prompt = 'For each of these shoe products, write a 1-sentence AI review summary (key insight buyers care about) and a 1-sentence insight (interesting fact, technology, or who uses it). Be specific and helpful. Respond ONLY with a JSON array like: [{"summary":"...","insight":"..."}]\n\n' + names;

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6', max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }]
  });

  const fallback = () => res.status(200).json(
    products.map(p => ({ ...p, summary: 'Highly rated by verified buyers.', insight: p.snippet }))
  );

  try {
    const r = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
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
          res.status(200).json(products.map((p, i) => ({
            ...p,
            summary: enriched[i] ? enriched[i].summary : 'Highly rated by verified buyers.',
            insight: enriched[i] ? enriched[i].insight : p.snippet
          })));
        } catch(e) { fallback(); }
      });
    });
    r.on('error', fallback);
    r.write(payload);
    r.end();
  } catch(e) { fallback(); }
}
