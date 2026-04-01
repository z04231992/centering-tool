/**
 * Card detection using brightness projection profiles.
 *
 * For a card on a contrasting background:
 * 1. Compute average brightness for each column → find left/right card edges
 * 2. Compute average brightness for each row → find top/bottom card edges
 * 3. Within the detected card, use color sampling to find inner border
 */

import type { GuidePositions } from "@/stores/measurement-store";

export interface DetectionResult {
  outer: GuidePositions;
  inner: GuidePositions;
  confidence: number;
}

export function detectCardFromImage(
  gray: Float32Array,
  width: number,
  height: number,
  rgbData?: Uint8ClampedArray
): DetectionResult | null {
  // ============================================================
  // STEP 1: Find OUTER card edges using brightness profiles
  // ============================================================

  // Average brightness per column
  const colAvg = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = 0; y < height; y++) {
      sum += gray[y * width + x];
    }
    colAvg[x] = sum / height;
  }

  // Average brightness per row
  const rowAvg = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = 0; x < width; x++) {
      sum += gray[y * width + x];
    }
    rowAvg[y] = sum / width;
  }

  // Find card boundaries using the steepest rise/fall in profiles
  const outerLeft = findProfileEdge(colAvg, "rising");
  const outerRight = findProfileEdge(colAvg, "falling");
  const outerTop = findProfileEdge(rowAvg, "rising");
  const outerBottom = findProfileEdge(rowAvg, "falling");

  if (outerLeft < 0 || outerRight < 0 || outerTop < 0 || outerBottom < 0) return null;
  if (outerRight <= outerLeft + 20 || outerBottom <= outerTop + 20) return null;

  const cardW = outerRight - outerLeft;
  const cardH = outerBottom - outerTop;

  // Validate size (card should be 15-95% of image)
  const areaRatio = (cardW * cardH) / (width * height);
  if (areaRatio < 0.10 || areaRatio > 0.97) return null;

  const outer: GuidePositions = {
    left: (outerLeft / width) * 100,
    top: (outerTop / height) * 100,
    right: (outerRight / width) * 100,
    bottom: (outerBottom / height) * 100,
  };

  // ============================================================
  // STEP 2: Find INNER border edges
  // Sample the card border color, scan inward until it changes
  // ============================================================
  const inner = findInnerBorder(gray, width, height,
    outerLeft, outerTop, outerRight, outerBottom, rgbData);

  const aspect = cardW / cardH;
  const idealAspect = aspect > 1 ? 1.4 : 0.714;
  const aspectScore = 1 - Math.min(1, Math.abs(aspect - idealAspect) / idealAspect);

  return {
    outer,
    inner,
    confidence: Math.min(1, areaRatio * 0.3 + aspectScore * 0.4 + 0.3),
  };
}

/**
 * Find the edge in a brightness profile.
 * "rising" = scan left→right for the biggest upward step (entering the card)
 * "falling" = scan right→left for the biggest upward step (entering the card from the other side)
 */
function findProfileEdge(profile: Float32Array, type: "rising" | "falling"): number {
  const len = profile.length;
  const smoothed = smoothProfile(profile, 5);

  // Compute derivative (gradient)
  const gradient = new Float32Array(len);
  for (let i = 1; i < len - 1; i++) {
    gradient[i] = smoothed[i + 1] - smoothed[i - 1];
  }

  if (type === "rising") {
    // Find max positive gradient in the first half
    let maxGrad = 0;
    let bestPos = -1;
    const searchEnd = Math.floor(len * 0.6);
    for (let i = 2; i < searchEnd; i++) {
      if (gradient[i] > maxGrad && gradient[i] > 3) {
        maxGrad = gradient[i];
        bestPos = i;
      }
    }
    return bestPos;
  } else {
    // Find max negative gradient (biggest drop) in the second half
    let maxGrad = 0;
    let bestPos = -1;
    const searchStart = Math.floor(len * 0.4);
    for (let i = searchStart; i < len - 2; i++) {
      const neg = -gradient[i]; // flip sign to find steepest drop
      if (neg > maxGrad && neg > 3) {
        maxGrad = neg;
        bestPos = i;
      }
    }
    return bestPos;
  }
}

/** Smooth a 1D profile with a box filter */
function smoothProfile(arr: Float32Array, radius: number): Float32Array {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(arr.length - 1, i + radius); j++) {
      sum += arr[j];
      count++;
    }
    out[i] = sum / count;
  }
  return out;
}

/**
 * Find inner border by sampling the card's border color, then scanning inward
 * from each outer edge until the brightness profile changes significantly.
 */
function findInnerBorder(
  gray: Float32Array,
  width: number,
  height: number,
  outerLeft: number,
  outerTop: number,
  outerRight: number,
  outerBottom: number,
  _rgbData?: Uint8ClampedArray
): GuidePositions {
  const cardW = outerRight - outerLeft;
  const cardH = outerBottom - outerTop;

  // Build brightness profiles WITHIN the card for each edge
  // Left edge profile: average brightness along vertical center strip, stepping right
  const leftProfile = buildEdgeProfile(gray, width, height,
    outerLeft, outerTop, outerBottom, "horizontal", 1, Math.round(cardW * 0.3));
  const rightProfile = buildEdgeProfile(gray, width, height,
    outerRight, outerTop, outerBottom, "horizontal", -1, Math.round(cardW * 0.3));
  const topProfile = buildEdgeProfile(gray, width, height,
    outerTop, outerLeft, outerRight, "vertical", 1, Math.round(cardH * 0.3));
  const bottomProfile = buildEdgeProfile(gray, width, height,
    outerBottom, outerLeft, outerRight, "vertical", -1, Math.round(cardH * 0.3));

  // Find the strongest gradient in each profile (border → artwork transition)
  const innerLeftOff = findInnerEdgeInProfile(leftProfile);
  const innerRightOff = findInnerEdgeInProfile(rightProfile);
  const innerTopOff = findInnerEdgeInProfile(topProfile);
  const innerBottomOff = findInnerEdgeInProfile(bottomProfile);

  // Convert offsets to pixel positions
  const fallbackX = cardW * 0.07;
  const fallbackY = cardH * 0.05;

  const innerLeftPx = innerLeftOff >= 0 ? outerLeft + innerLeftOff : outerLeft + fallbackX;
  const innerRightPx = innerRightOff >= 0 ? outerRight - innerRightOff : outerRight - fallbackX;
  const innerTopPx = innerTopOff >= 0 ? outerTop + innerTopOff : outerTop + fallbackY;
  const innerBottomPx = innerBottomOff >= 0 ? outerBottom - innerBottomOff : outerBottom - fallbackY;

  return {
    left: (innerLeftPx / width) * 100,
    top: (innerTopPx / height) * 100,
    right: (innerRightPx / width) * 100,
    bottom: (innerBottomPx / height) * 100,
  };
}

/**
 * Build a 1D brightness profile by scanning from a card edge inward.
 * Averages across multiple perpendicular sample lines for robustness.
 */
function buildEdgeProfile(
  gray: Float32Array,
  width: number,
  _height: number,
  edgePos: number,
  perpStart: number,
  perpEnd: number,
  direction: "horizontal" | "vertical",
  dir: number,
  maxSteps: number
): number[] {
  const sampleCount = 20;
  const perpStep = Math.max(1, Math.floor((perpEnd - perpStart) / (sampleCount + 2)));
  const totalPixels = gray.length;
  const profile: number[] = [];

  for (let step = 0; step < maxSteps; step++) {
    let sum = 0, count = 0;

    for (let s = 1; s <= sampleCount; s++) {
      const perpPos = perpStart + perpStep * s;

      let idx: number;
      if (direction === "horizontal") {
        // edgePos is x, perpPos is y, scanning x direction
        const x = edgePos + step * dir;
        const y = perpPos;
        idx = y * width + x;
      } else {
        // edgePos is y, perpPos is x, scanning y direction
        const x = perpPos;
        const y = edgePos + step * dir;
        idx = y * width + x;
      }

      if (idx >= 0 && idx < totalPixels) {
        sum += gray[idx];
        count++;
      }
    }

    profile.push(count > 0 ? sum / count : 0);
  }

  return profile;
}

/**
 * Find the inner edge in a brightness profile (scanned from card edge inward).
 * Returns the offset (in pixels from the edge) where the strongest gradient is.
 */
function findInnerEdgeInProfile(profile: number[]): number {
  if (profile.length < 10) return -1;

  // Smooth the profile
  const smoothed: number[] = [];
  const radius = 2;
  for (let i = 0; i < profile.length; i++) {
    let sum = 0, count = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(profile.length - 1, i + radius); j++) {
      sum += profile[j];
      count++;
    }
    smoothed.push(sum / count);
  }

  // Find the strongest gradient (biggest brightness change)
  // Skip the first few pixels (card edge noise)
  const windowSize = 3;
  let maxGrad = 0;
  let bestPos = -1;

  for (let i = windowSize + 2; i < smoothed.length - windowSize; i++) {
    let before = 0, after = 0;
    for (let j = 0; j < windowSize; j++) {
      before += smoothed[i - 1 - j];
      after += smoothed[i + j];
    }
    before /= windowSize;
    after /= windowSize;

    const grad = Math.abs(after - before);
    if (grad > maxGrad && grad > 5) {
      maxGrad = grad;
      bestPos = i;
    }
  }

  return bestPos;
}
