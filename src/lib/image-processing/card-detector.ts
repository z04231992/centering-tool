/**
 * Card edge detection using blurred gradient scanning.
 *
 * Key insight: Blur the image before scanning. This:
 * - Removes thin features (toploader reflections, sleeve edges, JPEG artifacts)
 * - Preserves broad transitions (card edge against background)
 * - Makes the card edge the dominant gradient
 *
 * Algorithm:
 * 1. Load image, apply box blur (radius=4)
 * 2. For each edge, cast scan lines from image border inward
 * 3. Find FIRST position where gradient > adaptive threshold
 * 4. Median across scan lines → robust edge
 * 5. Repeat within card area for inner border (less blur)
 */

import type { GuidePositions } from "@/stores/measurement-store";
import type { Point } from "./perspective-warp";
import { detectCorners, warpToRectangle } from "./perspective-warp";

export interface AutoDetectResult {
  outer: GuidePositions;
  inner: GuidePositions;
  confidence: number;
  /** If warped, this is the warped image data URL */
  warpedImageSrc?: string;
}

/** Raw edge point data returned by the scanner for corner detection */
interface EdgePointData {
  leftPts: Point[];
  rightPts: Point[];
  topPts: Point[];
  bottomPts: Point[];
}

function loadImageData(imageSrc: string, maxDim = 600): Promise<{ data: Uint8ClampedArray; w: number; h: number }> {
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

function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length & 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Convert RGBA data to grayscale with SATURATION BOOST.
 *
 * Inspired by the user's idea: converting to B&W with Yellow cranked to 300
 * makes card borders appear as bright white against dark backgrounds.
 *
 * We generalize this: boost ALL saturated colors (yellow, red, blue, etc.)
 * so ANY colored card border becomes bright white, while neutral
 * backgrounds, toploaders, and sleeves (gray/black) stay dark.
 *
 * Mode "saturation": gray = saturation * 1.5 + standardGray * 0.3
 *   → Best for colored borders. Suppresses toploaders and neutral surfaces.
 *
 * Mode "luminance": gray = standard luminance grayscale
 *   → Fallback for white/neutral borders that saturation mode misses.
 */
function toGray(data: Uint8ClampedArray, w: number, h: number, mode: "saturation" | "luminance" = "saturation"): Float32Array {
  const gray = new Float32Array(w * h);

  for (let i = 0; i < gray.length; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    if (mode === "saturation") {
      // Saturation-weighted: colored borders → bright, neutral surfaces → dim
      const standardGray = 0.299 * r + 0.587 * g + 0.114 * b;
      const saturation = Math.max(r, g, b) - Math.min(r, g, b);
      gray[i] = Math.min(255, saturation * 1.5 + standardGray * 0.3);
    } else {
      // Standard luminance grayscale — works for white/neutral borders
      gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  return gray;
}

/** Box blur (separable, single pass) */
function boxBlur(gray: Float32Array, w: number, h: number, radius: number): Float32Array {
  const result = new Float32Array(w * h);
  const temp = new Float32Array(w * h);

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    let sum = 0;
    let count = 0;
    // Initialize window
    for (let x = 0; x <= radius && x < w; x++) {
      sum += gray[y * w + x];
      count++;
    }
    for (let x = 0; x < w; x++) {
      temp[y * w + x] = sum / count;
      // Expand right side
      const addX = x + radius + 1;
      if (addX < w) { sum += gray[y * w + addX]; count++; }
      // Shrink left side
      const removeX = x - radius;
      if (removeX >= 0) { sum -= gray[y * w + removeX]; count--; }
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = 0;
    let count = 0;
    for (let y = 0; y <= radius && y < h; y++) {
      sum += temp[y * w + x];
      count++;
    }
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

/** Get brightness from gray array with bounds check */
function grayAt(gray: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 0 || x >= w || y < 0 || y >= h) return 0;
  return gray[y * w + x];
}

/** Horizontal gradient using central difference, smoothed over 5 rows */
function gradH(gray: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x < 1 || x >= w - 1) return 0;
  let sum = 0, count = 0;
  for (let dy = -2; dy <= 2; dy++) {
    const ny = y + dy;
    if (ny >= 0 && ny < h) {
      sum += Math.abs(grayAt(gray, w, h, x + 1, ny) - grayAt(gray, w, h, x - 1, ny));
      count++;
    }
  }
  return (sum / count) / 2;
}

/** Vertical gradient using central difference, smoothed over 5 columns */
function gradV(gray: Float32Array, w: number, h: number, x: number, y: number): number {
  if (y < 1 || y >= h - 1) return 0;
  let sum = 0, count = 0;
  for (let dx = -2; dx <= 2; dx++) {
    const nx = x + dx;
    if (nx >= 0 && nx < w) {
      sum += Math.abs(grayAt(gray, w, h, nx, y + 1) - grayAt(gray, w, h, nx, y - 1));
      count++;
    }
  }
  return (sum / count) / 2;
}

/** Scan from left: find first gradient above adaptive threshold */
function scanLeft(gray: Float32Array, w: number, h: number,
  y: number, xStart: number, xEnd: number): number | null {
  // Pass 1: find max gradient
  let maxG = 0;
  for (let x = xStart; x < xEnd; x++) {
    const g = gradH(gray, w, h, x, y);
    if (g > maxG) maxG = g;
  }
  if (maxG < 8) return null;
  const threshold = Math.max(12, maxG * 0.4);

  // Pass 2: first above threshold
  for (let x = xStart; x < xEnd; x++) {
    if (gradH(gray, w, h, x, y) >= threshold) return x;
  }
  return null;
}

function scanRight(gray: Float32Array, w: number, h: number,
  y: number, xStart: number, xEnd: number): number | null {
  let maxG = 0;
  for (let x = xStart; x < xEnd; x++) {
    const g = gradH(gray, w, h, x, y);
    if (g > maxG) maxG = g;
  }
  if (maxG < 8) return null;
  const threshold = Math.max(12, maxG * 0.4);

  for (let x = xEnd - 1; x >= xStart; x--) {
    if (gradH(gray, w, h, x, y) >= threshold) return x;
  }
  return null;
}

function scanTop(gray: Float32Array, w: number, h: number,
  x: number, yStart: number, yEnd: number): number | null {
  let maxG = 0;
  for (let y = yStart; y < yEnd; y++) {
    const g = gradV(gray, w, h, x, y);
    if (g > maxG) maxG = g;
  }
  if (maxG < 8) return null;
  const threshold = Math.max(12, maxG * 0.4);

  for (let y = yStart; y < yEnd; y++) {
    if (gradV(gray, w, h, x, y) >= threshold) return y;
  }
  return null;
}

function scanBottom(gray: Float32Array, w: number, h: number,
  x: number, yStart: number, yEnd: number): number | null {
  let maxG = 0;
  for (let y = yStart; y < yEnd; y++) {
    const g = gradV(gray, w, h, x, y);
    if (g > maxG) maxG = g;
  }
  if (maxG < 8) return null;
  const threshold = Math.max(12, maxG * 0.4);

  for (let y = yEnd - 1; y >= yStart; y--) {
    if (gradV(gray, w, h, x, y) >= threshold) return y;
  }
  return null;
}

/**
 * Generate a B&W preview image with saturation boost.
 * This is the visual representation of what the detection algorithm "sees":
 * colored borders → bright white, neutral surfaces → dark.
 *
 * Returns a data URL of the processed image.
 */
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
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        const standardGray = 0.299 * r + 0.587 * g + 0.114 * b;
        const saturation = Math.max(r, g, b) - Math.min(r, g, b);

        const boosted = Math.min(255, saturation * 1.5 + standardGray * 0.3);

        data[i] = boosted;     // R
        data[i + 1] = boosted; // G
        data[i + 2] = boosted; // B
        // Alpha stays the same
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Failed to process image"));
    img.src = imageSrc;
  });
}

/**
 * Run edge detection on a single grayscale image.
 * Returns the result or null if not enough edges found.
 * Also returns raw edge points for corner detection (for perspective warp).
 */
function detectEdgesOnGray(
  rawGray: Float32Array, w: number, h: number, label: string
): { result: AutoDetectResult; edgePoints: EdgePointData } | null {
  // Apply HEAVY blur for outer edge detection (radius=5)
  const blurredOuter = boxBlur(rawGray, w, h, 5);
  // Apply LIGHTER blur for inner edge detection (radius=2)
  const blurredInner = boxBlur(rawGray, w, h, 2);

  const numLines = 50;

  // --- OUTER EDGES ---
  // Store both the 1D positions (for median) and full 2D points (for corner fitting)
  const leftEdges: number[] = [];
  const rightEdges: number[] = [];
  const topEdges: number[] = [];
  const bottomEdges: number[] = [];
  const leftPts: Point[] = [];
  const rightPts: Point[] = [];
  const topPts: Point[] = [];
  const bottomPts: Point[] = [];

  for (let i = 0; i < numLines; i++) {
    const y = Math.round(h * 0.15 + (h * 0.7 * i) / numLines);
    const x = Math.round(w * 0.15 + (w * 0.7 * i) / numLines);

    const l = scanLeft(blurredOuter, w, h, y, 1, Math.floor(w * 0.42));
    if (l !== null) { leftEdges.push(l); leftPts.push({ x: l, y }); }

    const r = scanRight(blurredOuter, w, h, y, Math.floor(w * 0.58), w - 1);
    if (r !== null) { rightEdges.push(r); rightPts.push({ x: r, y }); }

    const t = scanTop(blurredOuter, w, h, x, 1, Math.floor(h * 0.42));
    if (t !== null) { topEdges.push(t); topPts.push({ x, y: t }); }

    const b = scanBottom(blurredOuter, w, h, x, Math.floor(h * 0.58), h - 1);
    if (b !== null) { bottomEdges.push(b); bottomPts.push({ x, y: b }); }
  }

  console.log(`[Edge Detection] ${label} outer hits: L:${leftEdges.length} R:${rightEdges.length} T:${topEdges.length} B:${bottomEdges.length}`);

  const minHits = Math.floor(numLines * 0.2);
  if (leftEdges.length < minHits || rightEdges.length < minHits ||
      topEdges.length < minHits || bottomEdges.length < minHits) {
    return null;
  }

  const outerLeftPx = median(leftEdges);
  const outerRightPx = median(rightEdges);
  const outerTopPx = median(topEdges);
  const outerBottomPx = median(bottomEdges);
  const cardW = outerRightPx - outerLeftPx;
  const cardH = outerBottomPx - outerTopPx;

  if (cardW < w * 0.15 || cardH < h * 0.15) {
    console.warn(`[Edge Detection] ${label} card too small`);
    return null;
  }

  // --- INNER EDGES ---
  const innerMargin = Math.max(5, Math.floor(Math.min(cardW, cardH) * 0.05));
  const iLeft: number[] = [], iRight: number[] = [], iTop: number[] = [], iBottom: number[] = [];
  const innerLines = 40;

  for (let i = 0; i < innerLines; i++) {
    const y = Math.round(outerTopPx + cardH * 0.15 + (cardH * 0.7 * i) / innerLines);
    const x = Math.round(outerLeftPx + cardW * 0.15 + (cardW * 0.7 * i) / innerLines);

    const il = scanLeft(blurredInner, w, h, y,
      Math.round(outerLeftPx + innerMargin), Math.round(outerLeftPx + cardW * 0.35));
    if (il !== null) iLeft.push(il);

    const ir = scanRight(blurredInner, w, h, y,
      Math.round(outerRightPx - cardW * 0.35), Math.round(outerRightPx - innerMargin));
    if (ir !== null) iRight.push(ir);

    const it = scanTop(blurredInner, w, h, x,
      Math.round(outerTopPx + innerMargin), Math.round(outerTopPx + cardH * 0.35));
    if (it !== null) iTop.push(it);

    const ib = scanBottom(blurredInner, w, h, x,
      Math.round(outerBottomPx - cardH * 0.35), Math.round(outerBottomPx - innerMargin));
    if (ib !== null) iBottom.push(ib);
  }

  console.log(`[Edge Detection] ${label} inner hits: L:${iLeft.length} R:${iRight.length} T:${iTop.length} B:${iBottom.length}`);

  const fallback = Math.min(cardW, cardH) * 0.08;
  const innerLeftPx = iLeft.length >= 5 ? median(iLeft) : outerLeftPx + fallback;
  const innerRightPx = iRight.length >= 5 ? median(iRight) : outerRightPx - fallback;
  const innerTopPx = iTop.length >= 5 ? median(iTop) : outerTopPx + fallback;
  const innerBottomPx = iBottom.length >= 5 ? median(iBottom) : outerBottomPx - fallback;

  // Convert to percentages
  const outer: GuidePositions = {
    left: (outerLeftPx / w) * 100,
    right: (outerRightPx / w) * 100,
    top: (outerTopPx / h) * 100,
    bottom: (outerBottomPx / h) * 100,
  };

  const inner: GuidePositions = {
    left: Math.max((innerLeftPx / w) * 100, outer.left + 0.5),
    right: Math.min((innerRightPx / w) * 100, outer.right - 0.5),
    top: Math.max((innerTopPx / h) * 100, outer.top + 0.5),
    bottom: Math.min((innerBottomPx / h) * 100, outer.bottom - 0.5),
  };

  const hitRate = Math.min(leftEdges.length, rightEdges.length, topEdges.length, bottomEdges.length) / numLines;
  const confidence = Math.min(0.95, hitRate);

  return {
    result: { outer, inner, confidence },
    edgePoints: { leftPts, rightPts, topPts, bottomPts },
  };
}

/**
 * First-pass detection: find edges and optionally corners.
 * Returns the detection result + edge point data for warp.
 */
function runDualPassDetection(
  data: Uint8ClampedArray, w: number, h: number
): { result: AutoDetectResult; edgePoints: EdgePointData } | null {
  // Pass 1: Saturation-weighted (best for colored borders, skips toploaders)
  const satGray = toGray(data, w, h, "saturation");
  const satResult = detectEdgesOnGray(satGray, w, h, "Pass1-Saturation");

  if (satResult) {
    console.log("[Edge Detection] Pass 1 (saturation) succeeded");
    return satResult;
  }

  // Pass 2: Standard luminance (fallback for white/neutral borders)
  console.log("[Edge Detection] Pass 1 failed, trying luminance fallback...");
  const lumGray = toGray(data, w, h, "luminance");
  const lumResult = detectEdgesOnGray(lumGray, w, h, "Pass2-Luminance");

  if (lumResult) {
    console.log("[Edge Detection] Pass 2 (luminance) succeeded");
    return lumResult;
  }

  return null;
}

/**
 * Dual-pass card edge detection with optional perspective warp.
 *
 * When warp=true (default):
 * 1. Detect card edges + corners in the original image
 * 2. Fit lines through edge points to find the 4 exact corners
 * 3. Warp the image to a perfect rectangle (bird's-eye view)
 * 4. Re-detect edges on the warped image for precise measurements
 * 5. Return the warped image + measurements
 *
 * This eliminates camera perspective distortion, like the competitor's
 * "Warp card for better accuracy" feature.
 */
export async function detectCardEdges(
  imageSrc: string,
  options: { warp?: boolean } = {}
): Promise<AutoDetectResult | null> {
  const { warp = true } = options;
  console.log(`[Edge Detection] Starting detection (warp=${warp})...`);

  const { data, w, h } = await loadImageData(imageSrc, 800);
  console.log("[Edge Detection] Image:", w, "x", h);

  // First detection pass on the original image
  const firstPass = runDualPassDetection(data, w, h);
  if (!firstPass) {
    console.warn("[Edge Detection] Detection failed");
    return null;
  }

  if (!warp) {
    // No warp — return the direct detection result
    return firstPass.result;
  }

  // --- PERSPECTIVE WARP ---
  try {
    const { edgePoints } = firstPass;

    // Need enough points to fit lines (at least 5 per edge)
    const minPts = 5;
    if (edgePoints.leftPts.length < minPts || edgePoints.rightPts.length < minPts ||
        edgePoints.topPts.length < minPts || edgePoints.bottomPts.length < minPts) {
      console.warn("[Warp] Not enough edge points for corner detection, returning unwrapped");
      return firstPass.result;
    }

    // Detect 4 corners by fitting lines through edge points
    const corners = detectCorners(
      edgePoints.leftPts,
      edgePoints.rightPts,
      edgePoints.topPts,
      edgePoints.bottomPts
    );

    console.log("[Warp] Detected corners:", corners.map(c => `(${c.x.toFixed(1)},${c.y.toFixed(1)})`).join(" "));

    // Sanity check: corners should form a reasonable quadrilateral
    const topW = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    const leftH = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
    if (topW < w * 0.1 || leftH < h * 0.1) {
      console.warn("[Warp] Corners too close together, returning unwrapped");
      return firstPass.result;
    }

    // Load full-resolution image for warping (not the downscaled detection image)
    const fullRes = await loadImageData(imageSrc, 1200);
    const scale = fullRes.w / w;

    // Scale corners to full-res coordinates
    const scaledCorners = corners.map(c => ({ x: c.x * scale, y: c.y * scale }));

    // Warp to rectangle
    const warpedDataUrl = warpToRectangle(
      fullRes.data, fullRes.w, fullRes.h, scaledCorners
    );

    console.log("[Warp] Image warped successfully, re-detecting on warped image...");

    // Re-detect on the warped image for precise measurements
    const warpedImg = await loadImageData(warpedDataUrl, 800);
    const warpedPass = runDualPassDetection(warpedImg.data, warpedImg.w, warpedImg.h);

    if (warpedPass) {
      console.log("[Warp] Re-detection on warped image succeeded");
      return {
        ...warpedPass.result,
        warpedImageSrc: warpedDataUrl,
      };
    }

    // If re-detection on warped image fails, use original detection but still provide warped image
    console.warn("[Warp] Re-detection on warped failed, using original result + warped image");
    return {
      ...firstPass.result,
      warpedImageSrc: warpedDataUrl,
    };
  } catch (err) {
    console.warn("[Warp] Perspective warp failed, returning unwrapped result:", err);
    return firstPass.result;
  }
}
