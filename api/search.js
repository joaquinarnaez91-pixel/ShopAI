const https = require('https');

function stripHtml(str) {
  if (!str) return '';
  const plain = str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  if (plain.length <= 80) return plain;
  const dotIdx = plain.indexOf('.');
  if (dotIdx > 0 && dotIdx <= 80) return plain.slice(0, dotIdx + 1);
  const delIdx = plain.toLowerCase().indexOf('delivery');
  if (delIdx > 0 && delIdx + 8 <= 80) return plain.slice(0, delIdx + 8);
  return plain.slice(0, 80);
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

function makePricePoints(price) {
  const pts = Array.from({length: 30}, (_,j) => {
    const wave = Math.sin(j/4) * 0.04;
    const noise = (Math.sin(j*7.3+price) - 0.5) * 0.03;
    return Math.round(price * (1 + wave + noise));
  });
  pts[29] = price;
  return pts;
}

async function serpSearch(query, serpKey) {
  const params = new URLSearchParams({
    api_key: serpKey, engine: 'google_shopping', q: query, num: '15', gl: 'us', hl: 'en'
  });
  const data = await httpsGet('https://serpapi.com/search?' + params.toString());
  return (data.shopping_results || []).slice(0, 15).map(item => {
    const price = parseFloat((item.price || '0').replace(/[^0-9.]/g, '')) || 0;
    return {
      name: item.title, source: item.source || 'Retailer',
      price, rating: item.rating || 4.2, reviews: item.reviews || 0,
      img: item.thumbnail || '', link: item.product_link || item.link || '',
      delivery: stripHtml(item.delivery || ''), prices: makePricePoints(price),
      snippet: item.snippet || item.title,
      summary: '', insight: item.snippet || item.title
    };
  });
}

async function rainforestSearch(query, rfKey) {
  const params = new URLSearchParams({
    api_key: rfKey, type: 'search', amazon_domain: 'amazon.com', search_term: query
  });
  const data = await httpsGet('https://api.rainforestapi.com/request?' + params.toString());
  return (data.search_results || [])
    .filter(item => item.price !== undefined)
    .slice(0, 15)
    .map(item => {
      const price = parseFloat((item.price.value || '0').toString().replace(/[^0-9.]/g, '')) || 0;
      const brand = item.brand ? item.brand + ' — ' : '';
      return {
        name: item.title || '', source: 'Amazon', brand: item.brand || '',
        price, rating: item.rating || 4.2, reviews: item.ratings_total || 0,
        img: item.image || '', link: item.link || '',
        delivery: stripHtml((item.delivery && item.delivery.tagline) || 'Prime eligible'),
        prices: makePricePoints(price),
        snippet: brand + (item.title || ''),
        summary: '', insight: brand + (item.title || '')
      };
    });
}

function dedupe(products) {
  const seen = new Set();
  return products.filter(p => {
    const key = p.name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      model: 'claude-haiku-4-5-20251001', max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });
    const r = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      timeout: 20000,
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

async function rerankProducts(products, userProfile, userQuery) {
  const prompt = `You are a personal shopping expert. Re-rank these shoes for this specific user.

USER PROFILE: ${JSON.stringify(userProfile)}
USER QUERY: ${userQuery}

PRODUCTS TO RANK:
${products.map((p,i) => `${i}. ${p.name} - $${p.price} - ${p.source} - Rating: ${p.rating} (${p.reviews} reviews)`).join('\n')}

INSTRUCTIONS:
- Score each product 1-10 based on how well it matches this specific user
- Consider their foot type, budget, use case, and any stated preferences
- Eliminate products that clearly don't match (wrong category, way over budget, very low ratings)
- For top picks, write a ONE sentence personal reason why it matches THIS user specifically
- Return ONLY a JSON array: [{"index": 0, "score": 9, "reason": "Perfect for flat feet with extra stability support within your $150 budget"}, ...]
- Include maximum 6 products, minimum 3
- Sort by score descending`;

  try {
    const response = await callClaude(prompt);
    const clean = response.replace(/```json|```/g, '').trim();
    const ranked = JSON.parse(clean);
    return ranked
      .sort((a, b) => b.score - a.score)
      .slice(0, 6)
      .map(r => ({ ...products[r.index], aiScore: r.score, aiReason: r.reason }));
  } catch(e) {
    console.log('[search] Re-rank error:', e.message);
    return products.slice(0, 6);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { query, userProfile, userQuery } = req.body;
  const serpKey = process.env.SERPAPI_KEY;
  const rfKey = process.env.RAINFOREST_API_KEY;

  const [serpResult, rfResult] = await Promise.allSettled([
    serpSearch(query, serpKey),
    rfKey ? rainforestSearch(query, rfKey) : Promise.resolve([])
  ]);

  const serpProducts = serpResult.status === 'fulfilled' ? serpResult.value : [];
  const rfProducts   = rfResult.status === 'fulfilled'   ? rfResult.value   : [];

  if (serpResult.status === 'rejected') console.log('[search] SerpAPI error:', serpResult.reason?.message);
  if (rfResult.status === 'rejected')   console.log('[search] Rainforest error:', rfResult.reason?.message);

  const pool = dedupe([...rfProducts, ...serpProducts])
    .slice(0, 15)
    .map((p, i) => ({ ...p, id: i + 1 }));

  console.log(`[search] ${rfProducts.length} Amazon + ${serpProducts.length} SerpAPI → ${pool.length} pool → re-ranking`);

  const merged = await rerankProducts(pool, userProfile || {}, userQuery || query);
  const final = merged.map((p, i) => ({ ...p, id: i + 1 }));

  console.log(`[search] → ${final.length} ranked results`);
  res.status(200).json(final);
}
