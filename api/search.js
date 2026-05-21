const https = require('https');

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { query } = req.body;
  const serpKey = process.env.SERPAPI_KEY;

  const params = new URLSearchParams({
    api_key: serpKey, engine: 'google_shopping', q: query, num: '8', gl: 'us', hl: 'en'
  });

  const data = await new Promise((resolve, reject) => {
    https.get('https://serpapi.com/search?' + params.toString(), r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });

  const results = (data.shopping_results || []).slice(0, 6).map((item, i) => {
    const price = parseFloat((item.price || '0').replace(/[^0-9.]/g, '')) || 0;
    const points = Array.from({length:30}, (_,j) => {
      const wave = Math.sin(j/4) * 0.04;
      const noise = (Math.sin(j*7.3+price) - 0.5) * 0.03;
      return Math.round(price * (1 + wave + noise));
    });
    points[29] = price;
    return {
      id: i+1, name: item.title, source: item.source || 'Retailer',
      price, rating: item.rating || 4.2, reviews: item.reviews || 0,
      img: item.thumbnail || '', link: item.link || '',
      delivery: item.delivery || '', prices: points,
      snippet: item.snippet || item.title,
      summary: '', insight: item.snippet || item.title
    };
  });

  res.status(200).json(results);
}
