import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });
  
  const { imageUrl } = req.body;

  try {
    // rembg — removes background, returns clean person silhouette used as mask
    const output = await replicate.run(
      "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
      { input: { image: imageUrl } }
    );

    // Replicate v1.x returns FileOutput objects — convert to plain URL string
    const maskUrl = Array.isArray(output) ? String(output[0]) : String(output);
    res.status(200).json({ success: true, maskUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}