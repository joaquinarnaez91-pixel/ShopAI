const PRETTIFY_PROMPT = "Edit this photo: completely remove any person, hands, hanger, and background. Show only the garment as a professional e-commerce flat-lay product photo on a plain light-gray studio background, soft even lighting, subtle shadow under the garment. Lightly steamed look with minimal natural wrinkles. Preserve the garment exactly: same colors, fabric texture, sleeve length, neckline, and proportions. Reproduce any logos, graphics, or text EXACTLY as in the original photo — do not redraw, move, resize, or reinterpret them.";

export async function prettifyImage(imageBase64, mimeType = 'image/jpeg') {
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
