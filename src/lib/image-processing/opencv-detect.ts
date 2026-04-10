/**
 * Card edge detection using OpenCV.js (Canny + contour finding).
 *
 * Algorithm:
 * 1. Grayscale → GaussianBlur → Canny edge detection (multiple thresholds)
 * 2. Morphological close to fill edge gaps
 * 3. Find contours → filter for quadrilaterals near 5:7 aspect ratio
 * 4. Detect nested rectangles: toploader (outer) vs card (inner)
 * 5. Pick the card rectangle, compute inner border from proportions
 */

import { loadOpenCV } from "./opencv-loader";
import type { GuidePositions } from "@/stores/measurement-store";

export interface OpenCVDetectResult {
  outer: GuidePositions;
  inner: GuidePositions;
}

const BORDER_X = 0.055;
const BORDER_Y = 0.042;
const CARD_RATIO = 5 / 7; // 0.714

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

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

interface RectCandidate {
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  ratioScore: number;
}

function isInside(a: RectCandidate, b: RectCandidate): boolean {
  return (
    a.x > b.x &&
    a.y > b.y &&
    a.x + a.width < b.x + b.width &&
    a.y + a.height < b.y + b.height
  );
}

/** Merge near-identical rectangles found across different thresholds. */
function dedup(rects: RectCandidate[]): RectCandidate[] {
  const result: RectCandidate[] = [];
  const used = new Set<number>();

  for (let i = 0; i < rects.length; i++) {
    if (used.has(i)) continue;
    let best = rects[i];

    for (let j = i + 1; j < rects.length; j++) {
      if (used.has(j)) continue;
      const tol = Math.max(best.width, best.height) * 0.05;
      if (
        Math.abs(best.x - rects[j].x) < tol &&
        Math.abs(best.y - rects[j].y) < tol &&
        Math.abs(best.width - rects[j].width) < tol &&
        Math.abs(best.height - rects[j].height) < tol
      ) {
        used.add(j);
        if (rects[j].ratioScore < best.ratioScore) best = rects[j];
      }
    }
    result.push(best);
  }
  return result;
}

export async function detectCardEdgesOpenCV(
  imageSrc: string
): Promise<OpenCVDetectResult | null> {
  const cv = await loadOpenCV();
  console.log("[OpenCV] Starting detection...");

  // Load & resize image
  const img = await loadImageElement(imageSrc);
  const canvas = document.createElement("canvas");
  const maxDim = 1000;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx2d = canvas.getContext("2d")!;
  ctx2d.drawImage(img, 0, 0, canvas.width, canvas.height);

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const closed = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    const imgArea = canvas.width * canvas.height;
    let allCandidates: RectCandidate[] = [];

    // Try multiple Canny thresholds for robustness
    const thresholds: [number, number][] = [
      [30, 90],
      [50, 150],
      [75, 200],
    ];

    for (const [lo, hi] of thresholds) {
      cv.Canny(blurred, edges, lo, hi);

      // Morphological close fills small gaps in edges
      const kernel = cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(3, 3)
      );
      cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
      kernel.delete();

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(
        closed,
        contours,
        hierarchy,
        cv.RETR_LIST,
        cv.CHAIN_APPROX_SIMPLE
      );

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const peri = cv.arcLength(cnt, true);
        const approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

        if (approx.rows >= 4 && approx.rows <= 8) {
          const area = Math.abs(cv.contourArea(cnt));

          if (area > imgArea * 0.05 && area < imgArea * 0.98) {
            const rect = cv.boundingRect(cnt);
            const ratio = rect.width / rect.height;

            if (ratio > 0.45 && ratio < 1.1) {
              allCandidates.push({
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
                area,
                ratioScore:
                  Math.abs(ratio - CARD_RATIO) / CARD_RATIO,
              });
            }
          }
        }
        approx.delete();
      }

      contours.delete();
      hierarchy.delete();
    }

    // Merge duplicates from different thresholds
    allCandidates = dedup(allCandidates);
    console.log(
      `[OpenCV] ${allCandidates.length} rectangle candidates after dedup`
    );

    if (!allCandidates.length) {
      console.warn("[OpenCV] No rectangles found");
      return null;
    }

    // Sort by area descending
    allCandidates.sort((a, b) => b.area - a.area);

    // Check for nesting (toploader → card)
    let card = allCandidates[0];
    const largest = allCandidates[0];

    for (let i = 1; i < Math.min(allCandidates.length, 8); i++) {
      const inner = allCandidates[i];
      if (isInside(inner, largest) && inner.ratioScore < 0.18) {
        card = inner;
        console.log(
          "[OpenCV] Nested rectangles: toploader + card. Using inner."
        );
        break;
      }
    }

    // If selected card has poor ratio, try the best-ratio candidate instead
    if (card.ratioScore > 0.15) {
      const bestRatio = allCandidates.reduce((best, c) =>
        c.ratioScore < best.ratioScore ? c : best
      );
      if (bestRatio.ratioScore < card.ratioScore * 0.7) {
        card = bestRatio;
        console.log("[OpenCV] Using best-ratio candidate instead");
      }
    }

    // Convert to percentages
    const outer: GuidePositions = {
      left: (card.x / canvas.width) * 100,
      right: ((card.x + card.width) / canvas.width) * 100,
      top: (card.y / canvas.height) * 100,
      bottom: ((card.y + card.height) / canvas.height) * 100,
    };

    const ratio = card.width / card.height;
    console.log(
      `[OpenCV] Card: L=${outer.left.toFixed(1)}% R=${outer.right.toFixed(1)}% T=${outer.top.toFixed(1)}% B=${outer.bottom.toFixed(1)}% ratio=${ratio.toFixed(3)}`
    );

    return { outer, inner: calculateInnerBorder(outer) };
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    closed.delete();
  }
}
