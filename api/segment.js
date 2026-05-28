import Replicate from "replicate";

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  
  const { imageUrl } = req.body;

  try {
    // Usamos el modelo SAM 2 para segmentar
    const output = await replicate.run(
      "lucataco/sam2:c0f4d3...", // Verifica la versión actual en Replicate
      { input: { image: imageUrl } }
    );
    
    // El output será la máscara segmentada
    res.status(200).json({ maskUrl: output });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}