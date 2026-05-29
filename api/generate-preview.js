export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { outfitDescription, changeDescription, style } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(400).json({ error: 'No OpenAI key' });
  }

  console.log('[preview] key prefix:', process.env.OPENAI_API_KEY?.slice(0, 10));

  const prompt =
    'Fashion editorial flat lay or clothing on mannequin. ' +
    'NO human face, NO human body, NO model. ' +
    'Show only the clothing items displayed as if worn by an invisible person or laid flat. ' +
    'Outfit: ' + outfitDescription + '. ' +
    'With this addition: ' + changeDescription + '. ' +
    'Clean white background. ' +
    'Professional product photography, high quality fashion magazine style.';

  const models = ['gpt-image-1', 'dall-e-3'];
  let url = null;

  for (const model of models) {
    try {
      console.log('[preview] trying model:', model);
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          prompt,
          size: '1024x1024',
          n: 1
        })
      });

      const data = await response.json();
      console.log('[preview] model', model, 'status:', response.status,
        'error:', data.error?.message || 'none');

      if (response.ok && data.data?.[0]) {
        url = data.data[0].url ||
          (data.data[0].b64_json ?
            'data:image/png;base64,' + data.data[0].b64_json : null);
        if (url) {
          console.log('[preview] success with:', model);
          break;
        }
      }
    } catch(e) {
      console.error('[preview]', model, 'threw:', e.message);
    }
  }

  return res.status(200).json({ url });
}
