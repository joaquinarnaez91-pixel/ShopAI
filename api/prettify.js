import https from 'https';
import { verifyUser } from './_lib/getLumenContext.js';

const PRETTIFY_PROMPT = "Edit this photo: completely remove any person, hands, hanger, and background. Show only the garment as a professional e-commerce flat-lay product photo on a plain light-gray studio background, soft even lighting, subtle shadow under the garment. Lightly steamed look with minimal natural wrinkles. Preserve the garment exactly: same colors, fabric texture, sleeve length, neckline, and proportions. Reproduce any logos, graphics, or text EXACTLY as in the original photo — do not redraw, move, resize, or reinterpret them.";

export const config = { maxDuration: 60 };

async function prettifyWithGemini(imageBase64, mimeType) {
  const fetch = (await import('node-fetch')).default;

  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: PRETTIFY_PROMPT }
      ]
    }],
    generationConfig: { responseModalities: ['IMAGE'] }
  });

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY
      },
      body
    }
  );

  const result = await response.json();
  const parts = result?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData);

  if (!imagePart) {
    const textPart = parts.find(p => p.text);
    throw new Error(textPart?.text || JSON.stringify(result));
  }

  return imagePart.inlineData.data;
}

async function analyzeGarment(imageBase64, mimeType) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          {
            type: 'text',
            text: 'Analyze this clothing item. ' +
              'Return ONLY valid JSON, no other text:\n' +
              '{"name":"Light Blue Crew Neck T-Shirt","category":"tops","color":"light blue","brand":null,"description":"casual crew neck tee"}\n\n' +
              'Category must be exactly one of: tops, bottoms, dresses, shoes, accessories, outerwear\n' +
              'Name: specific and descriptive.\n' +
              'Brand: only if logo clearly visible, otherwise null.'
          }
        ]
      }]
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
          const text = body.content.filter(b => b.type === 'text').map(b => b.text).join('');
          resolve(JSON.parse(text.replace(/```json|```/g, '').trim()));
        } catch(e) {
          resolve({ name: 'Clothing Item', category: 'tops', color: 'unknown', brand: null, description: '' });
        }
      });
    });
    req.on('error', () => resolve({ name: 'Clothing Item', category: 'tops', color: 'unknown', brand: null, description: '' }));
    req.write(payload);
    req.end();
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { user } = await verifyUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { imageBase64, mimeType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: 'Image required' });

  console.log('[prettify] starting for user:', user.id);

  try {
    const [garmentData, cleanBase64] = await Promise.all([
      analyzeGarment(imageBase64, mimeType || 'image/jpeg'),
      prettifyWithGemini(imageBase64, mimeType || 'image/jpeg')
    ]);

    console.log('[prettify] identified:', garmentData.name, garmentData.category);
    return res.status(200).json({ cleanBase64, garmentData });
  } catch(e) {
    console.error('[prettify] error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
