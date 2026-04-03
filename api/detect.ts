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
          content: `You are a precision trading card edge detection tool for card grading/centering analysis.

CRITICAL DISTINCTION: Cards are often inside protective cases. You MUST detect the CARD edges, NOT the case edges:
- TOPLOADER: A rigid clear plastic case. The card sits inside with a small gap (2-5mm) between the card edge and the toploader edge on each side. The toploader has its own distinct edges — IGNORE THESE.
- PENNY SLEEVE: A thin clear plastic sleeve. Very tight fit but still has a visible edge separate from the card.
- The CARD itself has printed borders (often white, black, yellow, or colored). The card edge is where the printed cardstock begins, NOT where the plastic case begins.

HOW TO IDENTIFY THE CARD EDGE:
- Look for the transition from the transparent/reflective plastic case to the actual printed card surface
- The card will have a thin colored border running along all 4 sides (the card's printed border)
- Inside a toploader, there is typically a small dark gap between the toploader edge and the card edge
- The card has rounded corners; the toploader has sharper corners

Return ONLY a JSON object with percentage positions (0-100) relative to the full image:
{"left": number, "right": number, "top": number, "bottom": number}

The detected region should have approximately a 5:7 width:height ratio (standard 2.5" x 3.5" card).
Be as precise as possible — even 1-2% error matters for centering analysis.
Return ONLY the JSON, no explanation.`,
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
              text: "Find the exact edges of the TRADING CARD (not the toploader/sleeve). Return JSON only.",
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

    // Sanity check: card width should be smaller than card height (portrait orientation)
    const w = edges.right - edges.left;
    const h = edges.bottom - edges.top;
    if (w <= 0 || h <= 0) {
      return res.status(500).json({ error: "Invalid edges detected", edges });
    }

    return res.status(200).json(edges);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[AI Detection]", message);
    return res.status(500).json({ error: message });
  }
}
