/**
 * Card edge detection using GRADIENT PROJECTION.
 *
 * Key insight: At a card edge, EVERY row has a horizontal gradient at the same
 * x-position. So if we sum |horizontal gradient| down each column, the card's
 * left and right edges produce massive peaks. Internal artwork gradients are
 * scattered at random positions and don't accumulate into peaks.
 *
 * This is essentially a simplified Hough transform for axis-aligned lines,
 * and it's what document scanners use.
 *
 * Algorithm:
 * 1. Compute Sobel gradients (horizontal and vertical)
 * 2. Column projection of |Gx| → peaks = vertical edges (left/right card sides)
 * 3. Row projection of |Gy| → peaks = horizontal edges (top/bottom card sides)
 * 4. Find first significant peak from each border = card edge
 * 5. Per-line refinement in narrow band for corner fitting
 * 6. Inner border from standard card proportions
 */

import type { GuidePositions } from "@/stores/measurement-store";
import type { Point } from "./perspective-warp";
import { detectCorners, warpToRectangle } from "./perspective-warp";

export interface AutoDetectResult {
  outer: GuidePositions;
  inner: GuidePositions;
  confidence: number;
  warpedImageSrc?: string;
}

interface EdgePointData {
  leftPts: Point[];
  rightPts: Point[];
  topPts: Point[];
  bottomPts: Point[];
}

// ============================================================================
// IMAGE LOADING
// ============================================================================

function loadImageData(imageSrc: string, maxDim = 800): Promise<{ data: Uint8ClampedArray; w: number; h: number }> {
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
      resolve({ data: ctx.getImageData(0, 0, w, h).data, w, h });
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });
}

// ============================================================================
// MATH
// ============================================================================

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function robustMedian(arr: number[]): number {
  if (arr.length < 4) return median(arr);
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const filtered = sorted.filter(v => v >= lo && v <= hi);
  return filtered.length > 0 ? median(filtered) : median(arr);
}

// ============================================================================
// GRAYSCALE + BLUR
// ============================================================================

function toGray(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  }
  return gray;
}

function boxBlur(gray: Float32Array, w: number, h: number, radius: number): Float32Array {
  const result = new Float32Array(w * h);
  const temp = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    let sum = 0, count = 0;
    for (let x = 0; x <= radius && x < w; x++) { sum += gray[y * w + x]; count++; }
    for (let x = 0; x < w; x++) {
      temp[y * w + x] = sum / count;
      const addX = x + radius + 1;
      if (addX < w) { sum += gray[y * w + addX]; count++; }
      const removeX = x - radius;
      if (removeX >= 0) { sum -= gray[y * w + removeX]; count--; }
    }
  }

  for (let x = 0; x < w; x++) {
    let sum = 0, count = 0;
    for (let y = 0; y <= radius && y < h; y++) { sum += temp[y * w + x]; count++; }
    for (let y = 0; y < h; y++) {
      result[y * w + x] = sum / count;
      const addY = y + radius + 1;
      if (addY < h) { sum += temp[addY * w + x]; count++; }
      const removeY = y - radius;
      if (removeY >= 0) { sum -= temp[removeY * w + x]; count--; }
    }
  }
  return result;
}

// ============================================================================
// SOBEL GRADIENTS
// ============================================================================

interface GradientData {
  gx: Float32Array; // |horizontal gradient| → detects vertical edges (left/right)
  gy: Float32Array; // |vertical gradient| → detects horizontal edges (top/bottom)
}

function computeGradients(gray: Float32Array, w: number, h: number): GradientData {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      // Sobel 3x3 horizontal kernel
      gx[idx] = Math.abs(
        -gray[idx - w - 1] + gray[idx - w + 1]
        - 2 * gray[idx - 1] + 2 * gray[idx + 1]
        - gray[idx + w - 1] + gray[idx + w + 1]
      );
      // Sobel 3x3 vertical kernel
      gy[idx] = Math.abs(
        -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1]
        + gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1]
      );
    }
  }

  return { gx, gy };
}

// ============================================================================
// GRADIENT PROJECTION — find card edges
// ============================================================================


// ============================================================================
// PER-LINE REFINEMENT
// ============================================================================

// ============================================================================
// B&W PREVIEW
// ============================================================================

export async function generateProcessedPreview(imageSrc: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const { data } = imageData;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        const boosted = Math.min(255, sat * 1.5 + gray * 0.3);
        data[i] = boosted; data[i + 1] = boosted; data[i + 2] = boosted;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Failed to process image"));
    img.src = imageSrc;
  });
}

// ============================================================================
// CORE DETECTION
// ============================================================================

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
 * Detect outer card edges using per-line multi-edge scanning.
 *
 * For each side, sample many scan lines perpendicular to the edge.
 * On each scan line, find the TWO strongest gradient peaks from the outside in.
 * If two peaks exist within toploader-thickness range, the inner peak is the card.
 * Take the robust median across all scan lines.
 *
 * This approach works because each individual scan line can distinguish
 * toploader vs card edges, unlike projection which aggregates everything.
 */
function detectOuterEdges(
  data: Uint8ClampedArray, w: number, h: number
): { outer: GuidePositions; edgePoints: EdgePointData; confidence: number } | null {

  const rawGray = toGray(data, w, h);
  const blurred = boxBlur(rawGray, w, h, 2);
  const { gx, gy } = computeGradients(blurred, w, h);

  const NUM_LINES = 40;
  const MIN_GRADIENT = 8; // minimum gradient to count as an edge

  // Toploader gap: card edge is 2-12% of image dimension inward from toploader
  const minGapH = Math.round(w * 0.015);
  const maxGapH = Math.round(w * 0.13);
  const minGapV = Math.round(h * 0.015);
  const maxGapV = Math.round(h * 0.13);

  /**
   * Scan a horizontal line from x=startX toward x=endX (step +1 or -1).
   * Find the first two strong gradient peaks in |gx|.
   * Return the innermost (card) edge position.
   */
  function scanHorizontal(y: number, startX: number, endX: number, minGap: number, maxGap: number): number | null {
    const step = startX < endX ? 1 : -1;
    const gradArr = gx;

    // Find first strong peak (likely toploader or card)
    let firstPeak = -1;
    let firstVal = 0;
    for (let x = startX; x !== endX; x += step) {
      if (x < 1 || x >= w - 1) continue;
      const g = gradArr[y * w + x];
      if (g > firstVal) { firstVal = g; firstPeak = x; }
      // Once gradient drops significantly after finding a peak, stop
      if (firstPeak >= 0 && g < firstVal * 0.3 && Math.abs(x - firstPeak) > 3) break;
    }
    if (firstPeak < 0 || firstVal < MIN_GRADIENT) return null;

    // Look for second peak (card edge) inward from first peak
    const searchStart = firstPeak + step * minGap;
    const searchEnd = firstPeak + step * maxGap;
    const lo = Math.min(searchStart, searchEnd);
    const hi = Math.max(searchStart, searchEnd);

    let secondPeak = -1;
    let secondVal = 0;
    for (let x = Math.max(1, lo); x <= Math.min(w - 2, hi); x++) {
      const g = gradArr[y * w + x];
      if (g > secondVal && g >= MIN_GRADIENT) {
        secondVal = g;
        secondPeak = x;
      }
    }

    // If we found a second peak with reasonable strength, that's the card edge
    if (secondPeak >= 0 && secondVal >= firstVal * 0.15) {
      return secondPeak;
    }
    // Otherwise the first peak IS the card edge (no toploader)
    return firstPeak;
  }

  /**
   * Scan a vertical line from y=startY toward y=endY.
   * Find the first two strong gradient peaks in |gy|.
   */
  function scanVertical(x: number, startY: number, endY: number, minGap: number, maxGap: number): number | null {
    const step = startY < endY ? 1 : -1;
    const gradArr = gy;

    let firstPeak = -1;
    let firstVal = 0;
    for (let y = startY; y !== endY; y += step) {
      if (y < 1 || y >= h - 1) continue;
      const g = gradArr[y * w + x];
      if (g > firstVal) { firstVal = g; firstPeak = y; }
      if (firstPeak >= 0 && g < firstVal * 0.3 && Math.abs(y - firstPeak) > 3) break;
    }
    if (firstPeak < 0 || firstVal < MIN_GRADIENT) return null;

    const searchStart = firstPeak + step * minGap;
    const searchEnd = firstPeak + step * maxGap;
    const lo = Math.min(searchStart, searchEnd);
    const hi = Math.max(searchStart, searchEnd);

    let secondPeak = -1;
    let secondVal = 0;
    for (let y = Math.max(1, lo); y <= Math.min(h - 2, hi); y++) {
      const g = gradArr[y * w + x];
      if (g > secondVal && g >= MIN_GRADIENT) {
        secondVal = g;
        secondPeak = y;
      }
    }

    if (secondPeak >= 0 && secondVal >= firstVal * 0.15) {
      return secondPeak;
    }
    return firstPeak;
  }

  // === LEFT EDGE: scan horizontal lines from x=0 rightward ===
  const leftEdges: number[] = [];
  const leftPts: Point[] = [];
  for (let i = 0; i < NUM_LINES; i++) {
    const y = Math.round(h * 0.15 + (h * 0.7) * i / (NUM_LINES - 1));
    const edge = scanHorizontal(y, 0, Math.floor(w * 0.5), minGapH, maxGapH);
    if (edge !== null) {
      leftEdges.push(edge);
      leftPts.push({ x: edge, y });
    }
  }

  // === RIGHT EDGE: scan horizontal lines from x=w-1 leftward ===
  const rightEdges: number[] = [];
  const rightPts: Point[] = [];
  for (let i = 0; i < NUM_LINES; i++) {
    const y = Math.round(h * 0.15 + (h * 0.7) * i / (NUM_LINES - 1));
    const edge = scanHorizontal(y, w - 1, Math.floor(w * 0.5), minGapH, maxGapH);
    if (edge !== null) {
      rightEdges.push(edge);
      rightPts.push({ x: edge, y });
    }
  }

  // === TOP EDGE: scan vertical lines from y=0 downward ===
  const topEdges: number[] = [];
  const topPts: Point[] = [];
  for (let i = 0; i < NUM_LINES; i++) {
    const x = Math.round(w * 0.15 + (w * 0.7) * i / (NUM_LINES - 1));
    const edge = scanVertical(x, 0, Math.floor(h * 0.5), minGapV, maxGapV);
    if (edge !== null) {
      topEdges.push(edge);
      topPts.push({ x, y: edge });
    }
  }

  // === BOTTOM EDGE: scan vertical lines from y=h-1 upward ===
  const bottomEdges: number[] = [];
  const bottomPts: Point[] = [];
  for (let i = 0; i < NUM_LINES; i++) {
    const x = Math.round(w * 0.15 + (w * 0.7) * i / (NUM_LINES - 1));
    const edge = scanVertical(x, h - 1, Math.floor(h * 0.5), minGapV, maxGapV);
    if (edge !== null) {
      bottomEdges.push(edge);
      bottomPts.push({ x, y: edge });
    }
  }

  console.log(`[Detection] Scan hits: L:${leftEdges.length} R:${rightEdges.length} T:${topEdges.length} B:${bottomEdges.length}`);

  if (leftEdges.length < 5 || rightEdges.length < 5 || topEdges.length < 5 || bottomEdges.length < 5) {
    console.warn("[Detection] Not enough edge hits");
    return null;
  }

  // Take robust median of all edge positions
  const outerLeftPx = robustMedian(leftEdges);
  const outerRightPx = robustMedian(rightEdges);
  const outerTopPx = robustMedian(topEdges);
  const outerBottomPx = robustMedian(bottomEdges);

  const cardW = outerRightPx - outerLeftPx;
  const cardH = outerBottomPx - outerTopPx;
  const ratio = cardW / cardH;

  console.log(`[Detection] Outer: L:${outerLeftPx.toFixed(0)} R:${outerRightPx.toFixed(0)} T:${outerTopPx.toFixed(0)} B:${outerBottomPx.toFixed(0)} (${cardW.toFixed(0)}x${cardH.toFixed(0)}, ratio=${ratio.toFixed(3)})`);

  if (cardW < w * 0.15 || cardH < h * 0.15) {
    console.warn("[Detection] Card too small");
    return null;
  }

  const outer: GuidePositions = {
    left: (outerLeftPx / w) * 100,
    right: (outerRightPx / w) * 100,
    top: (outerTopPx / h) * 100,
    bottom: (outerBottomPx / h) * 100,
  };

  const hitRate = Math.min(leftEdges.length, rightEdges.length, topEdges.length, bottomEdges.length) / NUM_LINES;

  return {
    outer,
    edgePoints: {
      leftPts: leftPts.length >= 5 ? leftPts : [{ x: outerLeftPx, y: outerTopPx }, { x: outerLeftPx, y: outerBottomPx }],
      rightPts: rightPts.length >= 5 ? rightPts : [{ x: outerRightPx, y: outerTopPx }, { x: outerRightPx, y: outerBottomPx }],
      topPts: topPts.length >= 5 ? topPts : [{ x: outerLeftPx, y: outerTopPx }, { x: outerRightPx, y: outerTopPx }],
      bottomPts: bottomPts.length >= 5 ? bottomPts : [{ x: outerLeftPx, y: outerBottomPx }, { x: outerRightPx, y: outerBottomPx }],
    },
    confidence: Math.min(0.95, hitRate),
  };
}

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

export async function detectCardEdges(
  imageSrc: string,
  options: { warp?: boolean } = {}
): Promise<AutoDetectResult | null> {
  const { warp = true } = options;
  console.log(`[Detection] Starting (warp=${warp})...`);

  const { data, w, h } = await loadImageData(imageSrc, 800);
  console.log(`[Detection] Image: ${w}x${h}`);

  const outerResult = detectOuterEdges(data, w, h);
  if (!outerResult) {
    console.warn("[Detection] Failed");
    return null;
  }

  const inner = calculateInnerBorder(outerResult.outer);

  if (!warp) {
    return { outer: outerResult.outer, inner, confidence: outerResult.confidence };
  }

  // --- PERSPECTIVE WARP ---
  try {
    const { outer, edgePoints } = outerResult;

    const medLeft = (outer.left / 100) * w;
    const medRight = (outer.right / 100) * w;
    const medTop = (outer.top / 100) * h;
    const medBottom = (outer.bottom / 100) * h;
    const medW = medRight - medLeft;
    const medH = medBottom - medTop;

    const medCorners: Point[] = [
      { x: medLeft, y: medTop }, { x: medRight, y: medTop },
      { x: medRight, y: medBottom }, { x: medLeft, y: medBottom },
    ];

    let corners: Point[];
    const minPts = 15;
    const hasEnoughPts =
      edgePoints.leftPts.length >= minPts && edgePoints.rightPts.length >= minPts &&
      edgePoints.topPts.length >= minPts && edgePoints.bottomPts.length >= minPts;

    if (hasEnoughPts) {
      const fitCorners = detectCorners(
        edgePoints.leftPts, edgePoints.rightPts,
        edgePoints.topPts, edgePoints.bottomPts
      );
      console.log("[Warp] Line-fit corners:", fitCorners.map(c => `(${c.x.toFixed(1)},${c.y.toFixed(1)})`).join(" "));

      const maxDrift = Math.max(medW, medH) * 0.10;
      const drifts = fitCorners.map((c, i) => Math.hypot(c.x - medCorners[i].x, c.y - medCorners[i].y));

      const BLEND = 0.70;
      corners = fitCorners.map((fit, i) => {
        if (drifts[i] <= maxDrift) {
          return {
            x: fit.x * BLEND + medCorners[i].x * (1 - BLEND),
            y: fit.y * BLEND + medCorners[i].y * (1 - BLEND),
          };
        }
        return medCorners[i];
      });
    } else {
      corners = medCorners;
    }

    // Expand outward 5%
    const expandX = medW * 0.05;
    const expandY = medH * 0.05;
    corners = [
      { x: Math.max(0, corners[0].x - expandX), y: Math.max(0, corners[0].y - expandY) },
      { x: Math.min(w - 1, corners[1].x + expandX), y: Math.max(0, corners[1].y - expandY) },
      { x: Math.min(w - 1, corners[2].x + expandX), y: Math.min(h - 1, corners[2].y + expandY) },
      { x: Math.max(0, corners[3].x - expandX), y: Math.min(h - 1, corners[3].y + expandY) },
    ];

    console.log("[Warp] Final corners:", corners.map(c => `(${c.x.toFixed(1)},${c.y.toFixed(1)})`).join(" "));

    const fullRes = await loadImageData(imageSrc, 2000);
    const scale = fullRes.w / w;
    const scaledCorners = corners.map(c => ({ x: c.x * scale, y: c.y * scale }));

    const warpedDataUrl = warpToRectangle(fullRes.data, fullRes.w, fullRes.h, scaledCorners);
    console.log("[Warp] Warped, re-detecting...");

    const warpedImg = await loadImageData(warpedDataUrl, 800);
    const warpedResult = detectOuterEdges(warpedImg.data, warpedImg.w, warpedImg.h);

    if (warpedResult) {
      const warpedInner = calculateInnerBorder(warpedResult.outer);
      return {
        outer: warpedResult.outer,
        inner: warpedInner,
        confidence: warpedResult.confidence,
        warpedImageSrc: warpedDataUrl,
      };
    }

    return { outer, inner, confidence: outerResult.confidence, warpedImageSrc: warpedDataUrl };
  } catch (err) {
    console.warn("[Warp] Failed:", err);
    return { outer: outerResult.outer, inner, confidence: outerResult.confidence };
  }
}
