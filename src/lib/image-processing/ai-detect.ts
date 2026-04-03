/**
 * AI-powered card edge detection via OpenAI Vision API.
 * Calls the /api/detect serverless function.
 */

import type { GuidePositions } from "@/stores/measurement-store";

const BORDER_X = 0.055;
const BORDER_Y = 0.042;

function calculateInnerBorder(outer: GuidePositions): GuidePositions {
  const cardW = outer.right - outer.left;
  const cardH = outer.bottom - outer.top;
  return {
    left: outer.left + cardW * BORDER_X,
    right: outer.right - cardW * BORDER_X,
    top: outer.top + cardH * BORDER_Y,
    bottom: outer.bottom - cardH * BORDER_Y,
  };
}

/**
 * Compress the image to reduce payload size for the API call.
 * Returns a data URL of the compressed image.
 */
function compressImage(imageSrc: string, maxDim = 1200, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });
}

export interface AIDetectResult {
  outer: GuidePositions;
  inner: GuidePositions;
  confidence: number;
}

export async function detectCardEdgesAI(imageSrc: string): Promise<AIDetectResult | null> {
  console.log("[AI Detection] Starting...");

  try {
    // Compress image to reduce upload size
    const compressed = await compressImage(imageSrc);
    console.log("[AI Detection] Image compressed, calling API...");

    const response = await fetch("/api/detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: compressed }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      console.error("[AI Detection] API error:", error);
      return null;
    }

    const edges = await response.json();
    console.log("[AI Detection] Edges:", edges);

    const outer: GuidePositions = {
      left: edges.left,
      right: edges.right,
      top: edges.top,
      bottom: edges.bottom,
    };

    const inner = calculateInnerBorder(outer);

    return { outer, inner, confidence: 0.9 };
  } catch (err) {
    console.error("[AI Detection] Failed:", err);
    return null;
  }
}
