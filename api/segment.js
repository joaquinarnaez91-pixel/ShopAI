import Replicate from "replicate";

export const maxDuration = 30; // Aumentamos tiempo para el modelo de IA

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo POST permitido' });
  }

  const { imageUrl } = req.body;
  
  if (!imageUrl) {
    return res.status(400).json({ error: 'Falta la imageUrl' });
  }

  try {
    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    const output = await replicate.run(
      "lucataco/sam2:c0f4d306b6539151529a65681944510b64d732890696956636731304917a151b",
      { input: { image: imageUrl } }
    );
    
    return res.status(200).json({ success: true, maskUrl: output });
  } catch (error) {
    console.error("Error en Replicate:", error);
    return res.status(500).json({ error: error.message });
  }
}