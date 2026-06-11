const PRETTIFY_SUFFIX = "professional e-commerce flat-lay product photo on a plain light-gray studio background, soft even lighting, subtle shadow under the garment. Lightly steamed look with minimal natural wrinkles. Preserve the garment exactly: same colors, fabric texture, sleeve length, neckline, and proportions. Reproduce any logos, graphics, or text EXACTLY as in the original photo — do not redraw, move, resize, or reinterpret them.";

const PRETTIFY_PROMPT = "Edit this photo: completely remove any person, hands, hanger, and background. Show only the garment as a " + PRETTIFY_SUFFIX;

async function callGeminiImage(imageBase64, mimeType, prompt) {
  const body = JSON.stringify({
    contents: [{
      parts: [
        { inline_data: { mime_type: mimeType, data: imageBase64 } },
        { text: prompt }
      ]
    }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'] }
  });

  const response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body
    }
  );

  const rawText = await response.text();
  if (!response.ok) {
    console.error('[prettifyImage] Gemini HTTP', response.status, rawText.slice(0, 500));
    throw new Error(`Gemini ${response.status}: ${rawText.slice(0, 300)}`);
  }

  let result;
  try { result = JSON.parse(rawText); }
  catch(e) {
    console.error('[prettifyImage] non-JSON from Gemini:', rawText.slice(0, 500));
    throw new Error('Gemini returned non-JSON response');
  }

  const parts = result?.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find(p => p.inlineData);
  if (!imagePart) {
    const detail = parts.find(p => p.text)?.text || JSON.stringify(result).slice(0, 300);
    console.error('[prettifyImage] no image part in Gemini response:', detail);
    throw new Error('Gemini returned no image: ' + detail);
  }
  return imagePart.inlineData.data;
}

export async function prettifyImage(imageBase64, mimeType = 'image/jpeg') {
  return callGeminiImage(imageBase64, mimeType, PRETTIFY_PROMPT);
}

// NOTE: each item = one Gemini call (~$0.04), so a 4-item photo ≈ $0.16 — fine for beta, batch later if needed
export async function prettifyItemFromPhoto(imageBase64, mimeType = 'image/jpeg', itemDescription) {
  const prompt = `Extract ONLY the ${itemDescription} from this photo. Remove all other items, any person, hands, hanger, and background. Show only the ${itemDescription} as a ${PRETTIFY_SUFFIX}`;
  return callGeminiImage(imageBase64, mimeType, prompt);
}
