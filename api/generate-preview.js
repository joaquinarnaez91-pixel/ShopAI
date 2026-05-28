export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { outfitDescription, changeDescription, style } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(400).json({ error: 'No OpenAI key' });
  }

  const prompt =
    'Fashion editorial photo. ' +
    'Outfit: ' + outfitDescription + '. ' +
    'Styled with: ' + changeDescription + '. ' +
    'Style: ' + (style || 'modern casual') + '. ' +
    'Clean neutral background. ' +
    'Professional fashion photography. ' +
    'No face needed, focus on clothing.';

  console.log('[preview] generating...');

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt,
        size: '1024x1024',
        quality: 'standard',
        n: 1,
        response_format: 'url'
      })
    });

    const responseText = await response.text();
    const data = JSON.parse(responseText);
    console.log('[preview] status:', response.status);
    console.log('[preview] data keys:', Object.keys(data));

    if (!response.ok) {
      console.error('[preview] error:', data.error?.message);
      return res.status(400).json({ error: data.error?.message });
    }

    // gpt-image-1 may return url or b64_json
    const item = data.data?.[0];
    let url = item?.url;

    if (!url && item?.b64_json) {
      // Convert base64 to data URL
      url = 'data:image/png;base64,' + item.b64_json;
      console.log('[preview] using base64 response');
    }

    console.log('[preview] url received:', !!url);
    return res.status(200).json({ url });

  } catch(e) {
    console.error('[preview] failed:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
