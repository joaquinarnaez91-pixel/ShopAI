import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { personUrl, productUrl, part = 'upper_body' } = req.body;
  if (!personUrl || !productUrl) {
    return res.status(400).json({ error: 'personUrl and productUrl are required' });
  }
  const validParts = ['upper_body', 'lower_body', 'lower_half', 'dresses'];
  if (!validParts.includes(part)) {
    return res.status(400).json({ error: 'part must be one of: ' + validParts.join(', ') });
  }

  try {
    // FLUX-VTON — handles body detection internally, no external mask needed.
    // image   = person photo
    // garment = product/clothing image
    // part    = body region enum
    const output = await replicate.run(
      "subhash25rawat/flux-vton:a02643ce418c0e12bad371c4adbfaec0dd1cb34b034ef37650ef205f92ad6199",
      {
        input: {
          image: personUrl,
          garment: productUrl,
          part
        }
      }
    );

    // Replicate v1.x returns FileOutput objects — convert to plain URL string
    const resultUrl = Array.isArray(output) ? String(output[0]) : String(output);
    res.status(200).json({ success: true, resultUrl });
  } catch (error) {
    console.error('[warp] error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
