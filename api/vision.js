import { verifyUser, getLumenContext, saveMessage } from './_lib/getLumenContext.js';
import https from 'https';

function callClaudeVision(imageBase64, mimeType, userContext, prompt) {
  return new Promise((resolve, reject) => {
    const messages = [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mimeType, data: imageBase64 }
        },
        { type: 'text', text: prompt }
      ]
    }];

    const systemPrompt = `You are Lumen — a personal style advisor with expert knowledge of fashion, brands, and clothing. You are analyzing a photo for a specific user.

USER PROFILE:
${JSON.stringify(userContext.profile)}

Your job is to identify clothing items in the photo and help the user find them or similar items.

Always respond with valid JSON only. No markdown. No explanation outside the JSON.`;

    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system: systemPrompt,
      messages
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const body = JSON.parse(d);
          const text = body.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('');
          resolve(text);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Vision timeout')); });
    req.write(payload);
    req.end();
  });
}

export default async function handler(req, res) {
  console.log('[vision] request received');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { user } = await verifyUser(req);
  const userId = user?.id || null;

  let lumenContext = { profile: {}, recentHistory: [], wardrobe: [] };
  if (userId) {
    lumenContext = await getLumenContext(userId);
  }

  const { imageBase64, mimeType, mode } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'No image provided' });
  }

  const prompt = mode === 'match' ?
    `Analyze this clothing item or outfit.

Return JSON:
{
  "items": [
    {
      "type": "item type (top/bottom/dress/shoes/bag/accessory)",
      "description": "specific description",
      "color": "color name",
      "style": "style category",
      "brand_guess": "brand if visible or null",
      "search_query": "best search query to find this item",
      "style_match": true or false based on user profile,
      "match_reason": "why it does or doesn't match their palette and aesthetic"
    }
  ],
  "outfit_verdict": "overall verdict on whether this works for the user",
  "suggested_alternatives": ["alternative search query 1", "alternative search query 2"]
}`
  :
    `Identify every clothing item and accessory visible in this photo.

Return JSON:
{
  "items": [
    {
      "type": "item type",
      "description": "specific description including cut, fabric if visible",
      "color": "specific color name",
      "style": "style category (casual/formal/streetwear/boho etc)",
      "brand_guess": "brand name if logo/label visible, otherwise null",
      "price_range": "budget/mid/premium/luxury",
      "search_query": "exact search query to find this on Google Shopping",
      "style_match": true or false based on user palette and aesthetic
    }
  ],
  "scene_context": "where/how this outfit would be worn",
  "key_piece": "the standout item worth finding first"
}`;

  try {
    const rawResponse = await callClaudeVision(imageBase64, mimeType, lumenContext, prompt);

    const clean = rawResponse.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(clean);

    if (userId) {
      await saveMessage(userId, 'user', '[Photo uploaded for analysis]', 'style_guide', { type: 'vision', mode });
      await saveMessage(userId, 'assistant', JSON.stringify(analysis), 'style_guide', { type: 'vision_result' });
    }

    return res.status(200).json(analysis);

  } catch(e) {
    console.error('[vision] error:', e.message);
    return res.status(500).json({ error: 'Could not analyze image' });
  }
}
