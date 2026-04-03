import type { VercelRequest, VercelResponse } from "@vercel/node";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are a precision trading card edge detector. Your job is to find the EXACT edges of a physical trading card in a photo.

IMPORTANT — THE CARD IS USUALLY INSIDE A PROTECTIVE CASE:
- A "toploader" is a rigid clear plastic holder. There is a VISIBLE GAP (dark line/shadow) between the toploader edge and the card edge on all sides. You must find the CARD edge, which is INSIDE/INWARD from the toploader edge.
- A "penny sleeve" is a thin clear plastic sleeve around the card.
- NEVER return the toploader or sleeve edges. Always return the actual card edges.

HOW TO FIND THE CARD EDGE (not the toploader):
1. Start from the outside of the image and scan inward
2. The FIRST edge you encounter is the TOPLOADER — skip past this
3. After the toploader edge, there is a small gap (2-5mm, appears as a dark strip or shadow)
4. The SECOND edge inward is the ACTUAL CARD — this is what you must return
5. The card edge is where you see the printed card border begin (usually a thin colored line — white, black, yellow, silver, or colored border)

VISUAL CUES FOR THE CARD EDGE:
- The card has slightly ROUNDED corners (the toploader has sharp/square corners)
- The card's printed border is usually a different color than the dark gap
- If you see a thin dark gap between two edges, the INNER edge is the card

CONSTRAINTS:
- Standard trading card is 2.5" × 3.5" = 5:7 width:height ratio ≈ 0.714
- Your detected region MUST be close to this ratio. If it's not, you likely detected the toploader.
- The card edges should be INWARD from the toploader by roughly 1-4% of image width on each side

Return ONLY a JSON object — no text, no explanation, no markdown:
{"left": number, "right": number, "top": number, "bottom": number}

Values are percentages (0-100) relative to the full image dimensions.
Precision matters — even 0.5% error affects centering grades.`;

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
    const imageUrl = image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 200,
      temperature: 0.1, // Low temperature for more consistent/precise results
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
            { type: "text", text: "Detect the CARD edges (inside the toploader). Return JSON only." },
          ],
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim() || "";

    // Parse JSON (handle code blocks)
    let jsonStr = content;
    const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1].trim();

    const edges = JSON.parse(jsonStr);

    if (
      typeof edges.left !== "number" || typeof edges.right !== "number" ||
      typeof edges.top !== "number" || typeof edges.bottom !== "number"
    ) {
      return res.status(500).json({ error: "Invalid AI response", raw: content });
    }

    // Clamp
    edges.left = Math.max(0, Math.min(100, edges.left));
    edges.right = Math.max(0, Math.min(100, edges.right));
    edges.top = Math.max(0, Math.min(100, edges.top));
    edges.bottom = Math.max(0, Math.min(100, edges.bottom));

    const w = edges.right - edges.left;
    const h = edges.bottom - edges.top;

    if (w <= 0 || h <= 0) {
      return res.status(500).json({ error: "Invalid edges", edges });
    }

    // Aspect ratio check: if ratio is too wide (likely toploader), nudge edges inward
    const ratio = w / h;
    const expectedRatio = 5 / 7; // 0.714
    const ratioDiff = Math.abs(ratio - expectedRatio) / expectedRatio;

    if (ratioDiff > 0.08) {
      // Ratio is off by more than 8% — likely detected toploader
      // Adjust the wider dimension inward to match expected ratio
      if (ratio > expectedRatio) {
        // Too wide — move left/right inward
        const targetW = h * expectedRatio;
        const excess = w - targetW;
        edges.left += excess / 2;
        edges.right -= excess / 2;
      } else {
        // Too tall — move top/bottom inward
        const targetH = w / expectedRatio;
        const excess = h - targetH;
        edges.top += excess / 2;
        edges.bottom -= excess / 2;
      }
      console.log(`[AI] Ratio corrected: ${ratio.toFixed(3)} → ${expectedRatio.toFixed(3)}`);
    }

    return res.status(200).json(edges);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[AI Detection]", message);
    return res.status(500).json({ error: message });
  }
}
