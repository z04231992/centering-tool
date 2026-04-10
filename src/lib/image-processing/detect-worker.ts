/**
 * Web Worker for card edge detection.
 * Runs CPU-intensive detection off the main thread.
 *
 * Improved algorithm: Gradient + Intensity dual-signal scanning.
 * For each side, scans inward looking for:
 *   1. First gradient peak (toploader or card edge)
 *   2. Dark intensity valley after first peak (gap between toploader & card)
 *   3. Rising edge after the valley = actual card edge
 *
 * If no dark gap is found, the first gradient peak IS the card edge.
 *
 * Input:  { pixels: ArrayBuffer, w: number, h: number }
 * Output: { outer, inner } or { error }
 */

interface GuidePos {
  left: number; right: number; top: number; bottom: number;
}

// ── Math ──

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
  const filtered = sorted.filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr);
  return filtered.length > 0 ? median(filtered) : median(arr);
}

// ── Image processing ──

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

function computeGradients(gray: Float32Array, w: number, h: number) {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      gx[idx] = Math.abs(
        -gray[idx - w - 1] + gray[idx - w + 1]
        - 2 * gray[idx - 1] + 2 * gray[idx + 1]
        - gray[idx + w - 1] + gray[idx + w + 1]
      );
      gy[idx] = Math.abs(
        -gray[idx - w - 1] - 2 * gray[idx - w] - gray[idx - w + 1]
        + gray[idx + w - 1] + 2 * gray[idx + w] + gray[idx + w + 1]
      );
    }
  }
  return { gx, gy };
}

// ── Improved edge scanning with intensity + gradient dual signal ──

/**
 * Scan a horizontal line from startX toward endX.
 * Uses both gradient magnitude AND intensity to find the card edge.
 *
 * Strategy:
 * 1. Find first strong gradient peak (toploader or card edge)
 * 2. After first peak, scan inward looking for a dark intensity valley
 *    (the gap between toploader plastic and card)
 * 3. If dark valley found, the rising edge after it = card edge
 * 4. If no dark valley, the first peak IS the card edge (no toploader)
 */
function scanHorizontal(
  gray: Float32Array, gx: Float32Array, w: number,
  y: number, startX: number, endX: number,
  minGap: number, maxGap: number
): number | null {
  const step = startX < endX ? 1 : -1;
  const MIN_GRAD = 8;

  // Step 1: Find first strong gradient peak
  let firstPeak = -1, firstVal = 0;
  for (let x = startX; x !== endX; x += step) {
    if (x < 1 || x >= w - 1) continue;
    const g = gx[y * w + x];
    if (g > firstVal) { firstVal = g; firstPeak = x; }
    if (firstPeak >= 0 && g < firstVal * 0.3 && Math.abs(x - firstPeak) > 3) break;
  }
  if (firstPeak < 0 || firstVal < MIN_GRAD) return null;

  // Step 2: Look for dark intensity valley after first peak (the toploader gap)
  const searchStart = firstPeak + step * minGap;
  const searchEnd = firstPeak + step * maxGap;
  const lo = Math.min(searchStart, searchEnd);
  const hi = Math.max(searchStart, searchEnd);

  // Sample average intensity near the first peak (toploader brightness)
  let peakBrightness = 0;
  let pCount = 0;
  for (let x = firstPeak; x !== firstPeak + step * Math.min(5, minGap); x += step) {
    if (x >= 0 && x < w) { peakBrightness += gray[y * w + x]; pCount++; }
  }
  peakBrightness = pCount > 0 ? peakBrightness / pCount : 128;

  // Look for the darkest point in the gap region (the shadow/gap)
  let darkestVal = 255, darkestX = -1;
  let secondPeakX = -1, secondPeakVal = 0;

  for (let x = Math.max(1, lo); x <= Math.min(w - 2, hi); x++) {
    const intensity = gray[y * w + x];
    const grad = gx[y * w + x];

    // Track darkest point (potential gap)
    if (intensity < darkestVal) {
      darkestVal = intensity;
      darkestX = x;
    }

    // Track strongest gradient (potential card edge)
    if (grad > secondPeakVal && grad >= MIN_GRAD) {
      secondPeakVal = grad;
      secondPeakX = x;
    }
  }

  // Step 3: Decide which edge to use
  const gapDepth = peakBrightness - darkestVal;
  const hasGap = darkestX >= 0 && gapDepth > 15; // significant dark valley

  if (hasGap && secondPeakX >= 0) {
    // Found a dark gap + gradient after it — this is the card edge
    // Use the gradient peak that's on the card side of the dark gap
    const gradAfterGap = (step > 0)
      ? (secondPeakX > darkestX ? secondPeakX : -1)
      : (secondPeakX < darkestX ? secondPeakX : -1);

    if (gradAfterGap >= 0 && secondPeakVal >= firstVal * 0.1) {
      return gradAfterGap;
    }
  }

  if (secondPeakX >= 0 && secondPeakVal >= firstVal * 0.15) {
    // Found a second gradient peak (likely card edge even without clear dark gap)
    return secondPeakX;
  }

  // No gap, no second peak — first peak IS the card edge
  return firstPeak;
}

/** Same logic but vertical (scanning top/bottom) */
function scanVertical(
  gray: Float32Array, gy: Float32Array, w: number, h: number,
  x: number, startY: number, endY: number,
  minGap: number, maxGap: number
): number | null {
  const step = startY < endY ? 1 : -1;
  const MIN_GRAD = 8;

  let firstPeak = -1, firstVal = 0;
  for (let y = startY; y !== endY; y += step) {
    if (y < 1 || y >= h - 1) continue;
    const g = gy[y * w + x];
    if (g > firstVal) { firstVal = g; firstPeak = y; }
    if (firstPeak >= 0 && g < firstVal * 0.3 && Math.abs(y - firstPeak) > 3) break;
  }
  if (firstPeak < 0 || firstVal < MIN_GRAD) return null;

  const searchStart = firstPeak + step * minGap;
  const searchEnd = firstPeak + step * maxGap;
  const lo = Math.min(searchStart, searchEnd);
  const hi = Math.max(searchStart, searchEnd);

  let peakBrightness = 0, pCount = 0;
  for (let y = firstPeak; y !== firstPeak + step * Math.min(5, minGap); y += step) {
    if (y >= 0 && y < h) { peakBrightness += gray[y * w + x]; pCount++; }
  }
  peakBrightness = pCount > 0 ? peakBrightness / pCount : 128;

  let darkestVal = 255, darkestY = -1;
  let secondPeakY = -1, secondPeakVal = 0;

  for (let y = Math.max(1, lo); y <= Math.min(h - 2, hi); y++) {
    const intensity = gray[y * w + x];
    const grad = gy[y * w + x];
    if (intensity < darkestVal) { darkestVal = intensity; darkestY = y; }
    if (grad > secondPeakVal && grad >= MIN_GRAD) { secondPeakVal = grad; secondPeakY = y; }
  }

  const gapDepth = peakBrightness - darkestVal;
  const hasGap = darkestY >= 0 && gapDepth > 15;

  if (hasGap && secondPeakY >= 0) {
    const gradAfterGap = (step > 0)
      ? (secondPeakY > darkestY ? secondPeakY : -1)
      : (secondPeakY < darkestY ? secondPeakY : -1);
    if (gradAfterGap >= 0 && secondPeakVal >= firstVal * 0.1) return gradAfterGap;
  }

  if (secondPeakY >= 0 && secondPeakVal >= firstVal * 0.15) return secondPeakY;
  return firstPeak;
}

// ── Main detection ──

function detectEdges(data: Uint8ClampedArray, w: number, h: number): { outer: GuidePos } | null {
  const rawGray = toGray(data, w, h);
  const blurred = boxBlur(rawGray, w, h, 2);
  const { gx, gy } = computeGradients(blurred, w, h);

  const NUM_LINES = 50; // More scan lines for better accuracy
  const minGapH = Math.round(w * 0.01);
  const maxGapH = Math.round(w * 0.14);
  const minGapV = Math.round(h * 0.01);
  const maxGapV = Math.round(h * 0.14);

  const leftEdges: number[] = [];
  const rightEdges: number[] = [];
  const topEdges: number[] = [];
  const bottomEdges: number[] = [];

  for (let i = 0; i < NUM_LINES; i++) {
    const yFrac = 0.12 + 0.76 * i / (NUM_LINES - 1);
    const xFrac = 0.12 + 0.76 * i / (NUM_LINES - 1);
    const y = Math.round(h * yFrac);
    const x = Math.round(w * xFrac);

    const le = scanHorizontal(blurred, gx, w, y, 0, Math.floor(w * 0.45), minGapH, maxGapH);
    if (le !== null) leftEdges.push(le);

    const re = scanHorizontal(blurred, gx, w, y, w - 1, Math.floor(w * 0.55), minGapH, maxGapH);
    if (re !== null) rightEdges.push(re);

    const te = scanVertical(blurred, gy, w, h, x, 0, Math.floor(h * 0.45), minGapV, maxGapV);
    if (te !== null) topEdges.push(te);

    const be = scanVertical(blurred, gy, w, h, x, h - 1, Math.floor(h * 0.55), minGapV, maxGapV);
    if (be !== null) bottomEdges.push(be);
  }

  if (leftEdges.length < 5 || rightEdges.length < 5 || topEdges.length < 5 || bottomEdges.length < 5) {
    return null;
  }

  const outerLeftPx = robustMedian(leftEdges);
  const outerRightPx = robustMedian(rightEdges);
  const outerTopPx = robustMedian(topEdges);
  const outerBottomPx = robustMedian(bottomEdges);

  const cardW = outerRightPx - outerLeftPx;
  const cardH = outerBottomPx - outerTopPx;
  if (cardW < w * 0.15 || cardH < h * 0.15) return null;

  return {
    outer: {
      left: (outerLeftPx / w) * 100,
      right: (outerRightPx / w) * 100,
      top: (outerTopPx / h) * 100,
      bottom: (outerBottomPx / h) * 100,
    },
  };
}

// ── Inner border calculation ──

const BORDER_X = 0.055;
const BORDER_Y = 0.042;

function innerBorder(outer: GuidePos): GuidePos {
  const cw = outer.right - outer.left;
  const ch = outer.bottom - outer.top;
  return {
    left: outer.left + cw * BORDER_X,
    right: outer.right - cw * BORDER_X,
    top: outer.top + ch * BORDER_Y,
    bottom: outer.bottom - ch * BORDER_Y,
  };
}

// ── Worker message handler ──

self.onmessage = (e: MessageEvent) => {
  const { pixels, w, h } = e.data;
  const data = new Uint8ClampedArray(pixels);

  try {
    const result = detectEdges(data, w, h);
    if (!result) {
      self.postMessage({ error: "No card edges detected" });
      return;
    }

    const inner = innerBorder(result.outer);
    self.postMessage({ outer: result.outer, inner });
  } catch (err: any) {
    self.postMessage({ error: err?.message || "Detection failed" });
  }
};
