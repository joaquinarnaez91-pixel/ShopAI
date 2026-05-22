const fs = require('fs');
const crypto = require('crypto');

function getCacheKey(query) {
  return '/tmp/enrich_' + crypto.createHash('md5').update(query).digest('hex') + '.json';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const query = (req.query && req.query.query) || '';
  if (!query) { res.status(400).json({status: 'error', message: 'query parameter required'}); return; }

  const cacheKey = getCacheKey(query);
  try {
    const cached = JSON.parse(fs.readFileSync(cacheKey, 'utf8'));
    res.status(200).json(cached);
  } catch(e) {
    res.status(200).json({status: 'pending'});
  }
}
