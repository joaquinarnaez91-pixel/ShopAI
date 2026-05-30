async function generateImage(prompt) {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      size: '1024x1536',
      quality: 'standard',
      n: 1
    })
  });

  const data = await response.json();
  console.log('[occasion-img] status:', response.status);

  if (!response.ok) {
    console.error('[occasion-img] error:', data.error?.message);
    return null;
  }

  const item = data.data?.[0];
  if (item?.url) return item.url;
  if (item?.b64_json) return 'data:image/png;base64,' + item.b64_json;
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(400).json({ error: 'No OpenAI key' });
  }

  const { description, occasion, palette, gender } = req.body;

  if (!description) {
    return res.status(400).json({ error: 'description required' });
  }

  const prompt =
    'Professional fashion lookbook photo. ' +
    (gender === 'men' ? 'Male model. ' : 'Female model. ') +
    'Full body shot. Face turned away or not visible. No facial features shown. ' +
    description + ' ' +
    'Occasion: ' + (occasion || 'event') + '. ' +
    'Color palette: ' + (palette || 'neutral') + '. ' +
    'Clean white or very soft neutral background. ' +
    'Professional editorial fashion photography. Soft even lighting. ' +
    'The clothing is the hero of the image. High quality. Realistic fabric textures.';

  console.log('[occasion-img] generating for:', occasion);

  try {
    const url = await generateImage(prompt);
    if (!url) return res.status(500).json({ error: 'Generation failed' });
    return res.status(200).json({ url });
  } catch(e) {
    console.error('[occasion-img] threw:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
