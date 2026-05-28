import https from 'https';
import { verifyUser, getLumenContext, saveMessage } from './_lib/getLumenContext.js';

console.log('[outfit-check] OpenAI key set:', !!process.env.OPENAI_API_KEY);

async function analyzeOutfit(imageBase64, mimeType, profile, occasion) {
  const systemPrompt = `You are Lumen — a warm, honest personal style advisor. You give specific, actionable outfit feedback like a brilliant friend who happens to know everything about style.

USER PROFILE:
${JSON.stringify(profile)}

RULES:
- Be honest but kind. Never harsh.
- Be specific. Not "nice colors" but "the burgundy against your skin tone works"
- Give ONE improvement suggestion only. Not three. One. The most impactful one.
- Reference the occasion if provided.
- Keep total response under 120 words.

OUTPUT FORMAT — respond with valid JSON only:
{
  "verdict": "one sentence honest assessment",
  "what_works": "one specific thing that works",
  "one_change": "one specific improvement",
  "change_item": "the specific item to add or swap",
  "change_description": "description for image generation",
  "outfit_description": "full current outfit description for DALL-E",
  "occasion_fit": true or false,
  "confidence": 1-10
}`;

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: mimeType,
            data: imageBase64
          }
        },
        {
          type: 'text',
          text: 'Analyze this outfit.' + (occasion ? ' Occasion: ' + occasion : '')
        }
      ]
    }]
  });

  return new Promise((resolve, reject) => {
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
            .map(b => b.text).join('');
          const clean = text.replace(/```json|```/g, '').trim();
          resolve(JSON.parse(clean));
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.write(payload);
    req.end();
  });
}

async function generateSuggestionPreview(outfitDescription, changeDescription, style) {
  const prompt =
    'Fashion editorial photo. ' +
    'Outfit: ' + outfitDescription + '. ' +
    'Styled with: ' + changeDescription + '. ' +
    'Style aesthetic: ' + (style || 'modern casual') + '. ' +
    'Clean neutral background. ' +
    'Professional fashion photography. ' +
    'The clothing items are clearly visible. ' +
    'No face needed — focus on the outfit.';

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      size: '1024x1024',
      quality: 'standard',
      n: 1
    })
  });

  const data = await response.json();
  return data.data?.[0]?.url || null;
}

export default async function handler(req, res) {
  console.log('[outfit-check] request received');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { user } = await verifyUser(req);
  const userId = user?.id || null;

  let profile = {};
  if (userId) {
    const ctx = await getLumenContext(userId);
    profile = ctx.profile || {};
  }

  const { imageBase64, mimeType, occasion } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'No image provided' });
  }

  try {
    console.log('[outfit-check] analyzing...');
    const analysis = await analyzeOutfit(imageBase64, mimeType, profile, occasion);
    console.log('[outfit-check] verdict:', analysis.verdict);

    let previewUrl = null;
    if (analysis.one_change && analysis.outfit_description) {
      console.log('[outfit-check] generating preview...');
      previewUrl = await generateSuggestionPreview(
        analysis.outfit_description,
        analysis.change_description,
        profile.aesthetic?.[0]
      ).catch(e => {
        console.error('[outfit-check] preview failed:', e.message);
        return null;
      });
    }

    if (userId) {
      await saveMessage(userId, 'user', '[Outfit photo uploaded]', 'style_guide',
        { type: 'outfit_check', occasion });
      await saveMessage(userId, 'assistant', analysis.verdict, 'style_guide',
        { type: 'outfit_verdict', analysis, previewUrl });
    }

    return res.status(200).json({ ...analysis, previewUrl });

  } catch(e) {
    console.error('[outfit-check] error:', e.message);
    return res.status(500).json({ error: 'Could not analyze outfit' });
  }
}
