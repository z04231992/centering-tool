import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { image } = req.body;
  if (!image || typeof image !== "string") {
    return res.status(400).json({ error: "Missing image data" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "OPENAI_API_KEY not configured" });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content: `You are a trading card edge detection tool. Analyze the image and find the OUTER EDGES of the trading card itself (NOT the toploader, sleeve, or penny sleeve — the actual card inside).

Return ONLY a JSON object with percentage positions (0-100) of the card edges relative to the full image dimensions:
{"left": number, "right": number, "top": number, "bottom": number}

- left: percentage from the left edge of the image to the card's left edge
- right: percentage from the left edge of the image to the card's right edge
- top: percentage from the top of the image to the card's top edge
- bottom: percentage from the top of the image to the card's bottom edge

Be precise. The card is typically 2.5" x 3.5" (5:7 ratio). Look for the actual card border, not any protective case or sleeve around it. Return ONLY the JSON, no explanation.`,
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: {
                url: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`,
                detail: "high",
              },
            },
            {
              type: "text",
              text: "Detect the trading card edges. Return only JSON.",
            },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || "";

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const edges = JSON.parse(jsonStr);

    // Validate the response
    if (
      typeof edges.left !== "number" ||
      typeof edges.right !== "number" ||
      typeof edges.top !== "number" ||
      typeof edges.bottom !== "number"
    ) {
      return res.status(500).json({ error: "Invalid response from AI", raw: content });
    }

    // Clamp values
    edges.left = Math.max(0, Math.min(100, edges.left));
    edges.right = Math.max(0, Math.min(100, edges.right));
    edges.top = Math.max(0, Math.min(100, edges.top));
    edges.bottom = Math.max(0, Math.min(100, edges.bottom));

    return res.status(200).json(edges);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[AI Detection]", message);
    return res.status(500).json({ error: message });
  }
}
