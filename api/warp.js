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
    // Virtual try-on via IDM-VTON.
    // Verify / update the version hash at:
    //   https://replicate.com/adirik/virtual-try-on
    // human_img  = the body silhouette / person photo from Step 1
    // garm_img   = the product/garment image
    const output = await replicate.run(
      "adirik/virtual-try-on:c871bb9b046607b680449ecbae55fd8c6d945e0a1948644bf2361b3d021d3ff4",
      {
        input: {
          human_img: maskUrl,
          garm_img: productUrl,
          garment_des: "clothing item",
          is_checked: true,
          is_checked_crop: false,
          denoise_steps: 30,
          seed: 42
        }
      }
    );

    res.status(200).json({ success: true, resultUrl: output });
  } catch (error) {
    console.error('[warp] error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
