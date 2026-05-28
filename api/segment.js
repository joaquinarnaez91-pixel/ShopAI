import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });
  
  const { imageUrl } = req.body;

  try {
    // Modelo SAM 2 (Segment Anything 2)
    const output = await replicate.run(
      "lucataco/sam2:c0f4d306b6539151529a65681944510b64d732890696956636731304917a151b",
      { input: { image: imageUrl } }
    );
    
    // Devolvemos la URL de la máscara generada
    res.status(200).json({ success: true, maskUrl: output });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}