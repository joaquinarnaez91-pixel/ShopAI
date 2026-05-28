import Replicate from "replicate";

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { maskUrl, productUrl } = req.body;
  if (!maskUrl || !productUrl) {
    return res.status(400).json({ error: 'maskUrl and productUrl are required' });
  }

  try {
    // Virtual try-on via FLUX-VTON.
    // Get the exact version hash at:
    //   https://replicate.com/subhash25rawat/flux-vton
    // image  = the product/garment image
    // mask   = the body silhouette from Step 1
    const output = await replicate.run(
      "subhash25rawat/flux-vton:a02643ce418c0e12bad371c4adbfaec0dd1cb34b034ef37650ef205f92ad6199",
      {
        input: {
          image: productUrl,
          mask: maskUrl,
          prompt: "professional photo of a person wearing the garment, high quality, realistic fashion photography",
          strength: 0.85
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
