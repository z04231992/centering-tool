/**
 * Web Worker for card edge detection.
 * Runs CPU-intensive detection math off the main thread.
 *
 * Input:  { pixels: Uint8ClampedArray, w: number, h: number }
 * Output: { outer, inner, corners } or { error }
 */

interface GuidePos {
  left: number; right: number; top: number; bottom: number;
}

interface Point {
  x: number; y: number;
}

// ── Math helpers ──

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

// ── Edge scanning (per-line multi-edge) ──

function detectEdges(data: Uint8ClampedArray, w: number, h: number) {
  const rawGray = toGray(data, w, h);
  const blurred = boxBlur(rawGray, w, h, 2);
  const { gx, gy } = computeGradients(blurred, w, h);

  const NUM_LINES = 40;
  const MIN_GRADIENT = 8;
  const minGapH = Math.round(w * 0.015);
  const maxGapH = Math.round(w * 0.13);
  const minGapV = Math.round(h * 0.015);
  const maxGapV = Math.round(h * 0.13);

  function scanH(y: number, startX: number, endX: number, minGap: number, maxGap: number): number | null {
    const step = startX < endX ? 1 : -1;
    let firstPeak = -1, firstVal = 0;
    for (let x = startX; x !== endX; x += step) {
      if (x < 1 || x >= w - 1) continue;
      const g = gx[y * w + x];
      if (g > firstVal) { firstVal = g; firstPeak = x; }
      if (firstPeak >= 0 && g < firstVal * 0.3 && Math.abs(x - firstPeak) > 3) break;
    }
    if (firstPeak < 0 || firstVal < MIN_GRADIENT) return null;

    const lo = Math.min(firstPeak + step * minGap, firstPeak + step * maxGap);
    const hi = Math.max(firstPeak + step * minGap, firstPeak + step * maxGap);
    let secondPeak = -1, secondVal = 0;
    for (let x = Math.max(1, lo); x <= Math.min(w - 2, hi); x++) {
      const g = gx[y * w + x];
      if (g > secondVal && g >= MIN_GRADIENT) { secondVal = g; secondPeak = x; }
    }
    return (secondPeak >= 0 && secondVal >= firstVal * 0.15) ? secondPeak : firstPeak;
  }

  function scanV(x: number, startY: number, endY: number, minGap: number, maxGap: number): number | null {
    const step = startY < endY ? 1 : -1;
    let firstPeak = -1, firstVal = 0;
    for (let y = startY; y !== endY; y += step) {
      if (y < 1 || y >= h - 1) continue;
      const g = gy[y * w + x];
      if (g > firstVal) { firstVal = g; firstPeak = y; }
      if (firstPeak >= 0 && g < firstVal * 0.3 && Math.abs(y - firstPeak) > 3) break;
    }
    if (firstPeak < 0 || firstVal < MIN_GRADIENT) return null;

    const lo = Math.min(firstPeak + step * minGap, firstPeak + step * maxGap);
    const hi = Math.max(firstPeak + step * minGap, firstPeak + step * maxGap);
    let secondPeak = -1, secondVal = 0;
    for (let y = Math.max(1, lo); y <= Math.min(h - 2, hi); y++) {
      const g = gy[y * w + x];
      if (g > secondVal && g >= MIN_GRADIENT) { secondVal = g; secondPeak = y; }
    }
    return (secondPeak >= 0 && secondVal >= firstVal * 0.15) ? secondPeak : firstPeak;
  }

  const leftEdges: number[] = [], leftPts: Point[] = [];
  const rightEdges: number[] = [], rightPts: Point[] = [];
  const topEdges: number[] = [], topPts: Point[] = [];
  const bottomEdges: number[] = [], bottomPts: Point[] = [];

  for (let i = 0; i < NUM_LINES; i++) {
    const y = Math.round(h * 0.15 + (h * 0.7) * i / (NUM_LINES - 1));
    const x = Math.round(w * 0.15 + (w * 0.7) * i / (NUM_LINES - 1));

    const le = scanH(y, 0, Math.floor(w * 0.5), minGapH, maxGapH);
    if (le !== null) { leftEdges.push(le); leftPts.push({ x: le, y }); }

    const re = scanH(y, w - 1, Math.floor(w * 0.5), minGapH, maxGapH);
    if (re !== null) { rightEdges.push(re); rightPts.push({ x: re, y }); }

    const te = scanV(x, 0, Math.floor(h * 0.5), minGapV, maxGapV);
    if (te !== null) { topEdges.push(te); topPts.push({ x, y: te }); }

    const be = scanV(x, h - 1, Math.floor(h * 0.5), minGapV, maxGapV);
    if (be !== null) { bottomEdges.push(be); bottomPts.push({ x, y: be }); }
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

  const outer: GuidePos = {
    left: (outerLeftPx / w) * 100,
    right: (outerRightPx / w) * 100,
    top: (outerTopPx / h) * 100,
    bottom: (outerBottomPx / h) * 100,
  };

  return { outer, leftPts, rightPts, topPts, bottomPts };
}

// ── Corner fitting (line intersection) ──

function fitLine(points: Point[]): { slope: number; intercept: number; isVertical: boolean; avgX: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0, isVertical: false, avgX: points[0]?.x ?? 0 };

  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  for (const p of points) { sumX += p.x; sumY += p.y; sumXX += p.x * p.x; sumXY += p.x * p.y; }
  const denom = n * sumXX - sumX * sumX;
  const avgX = sumX / n;
  if (Math.abs(denom) < 1e-6) return { slope: 0, intercept: 0, isVertical: true, avgX };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // Outlier rejection (2 rounds)
  let pts = points;
  let fit = { slope, intercept, isVertical: false, avgX };
  for (let round = 0; round < 2; round++) {
    const residuals = pts.map(p => Math.abs(p.y - (fit.slope * p.x + fit.intercept)));
    const sorted = [...residuals].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    const mad = Math.max(0.5, med * 1.4826);
    const inliers = pts.filter((_, i) => residuals[i] < 2.5 * mad);
    if (inliers.length >= Math.max(3, n * 0.3)) {
      pts = inliers;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const p of pts) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; }
      const d = pts.length * sxx - sx * sx;
      if (Math.abs(d) > 1e-6) {
        fit = { slope: (pts.length * sxy - sx * sy) / d, intercept: (sy - fit.slope * sx) / pts.length, isVertical: false, avgX: sx / pts.length };
      }
    }
  }
  return fit;
}

function findCorners(leftPts: Point[], rightPts: Point[], topPts: Point[], bottomPts: Point[]): Point[] {
  const leftLine = fitLine(leftPts.map(p => ({ x: p.y, y: p.x })));  // x = f(y)
  const rightLine = fitLine(rightPts.map(p => ({ x: p.y, y: p.x })));
  const topLine = fitLine(topPts);     // y = f(x)
  const bottomLine = fitLine(bottomPts);

  function intersect(
    edge: { slope: number; intercept: number; isVertical: boolean; avgX: number },
    border: { slope: number; intercept: number; isVertical: boolean; avgX: number }
  ): Point {
    const es = edge.isVertical ? 0 : edge.slope;
    const ei = edge.isVertical ? edge.avgX : edge.intercept;
    const bs = border.isVertical ? 0 : border.slope;
    const bi = border.isVertical ? border.avgX : border.intercept;
    const denom = 1 - bs * es;
    if (Math.abs(denom) < 1e-10) return { x: es * bi + ei, y: bi };
    const y = (bs * ei + bi) / denom;
    return { x: es * y + ei, y };
  }

  return [
    intersect(leftLine, topLine),      // TL
    intersect(rightLine, topLine),     // TR
    intersect(rightLine, bottomLine),  // BR
    intersect(leftLine, bottomLine),   // BL
  ];
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

// ── Perspective warp (runs in worker using OffscreenCanvas) ──

function solveHomography(src: Point[], dst: Point[]): number[] {
  const A: number[][] = [];
  const B: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: xp, y: yp } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -xp * x, -xp * y]);
    B.push(xp);
    A.push([0, 0, 0, x, y, 1, -yp * x, -yp * y]);
    B.push(yp);
  }
  const n = 8;
  const aug = A.map((row, i) => [...row, B[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col, maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) { maxVal = Math.abs(aug[row][col]); maxRow = row; }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) continue;
    for (let j = col; j <= n; j++) aug[col][j] /= pivot;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = aug[row][col];
      for (let j = col; j <= n; j++) aug[row][j] -= f * aug[col][j];
    }
  }
  return [...aug.map(r => r[n]), 1];
}

function warpImage(
  srcData: Uint8ClampedArray, srcW: number, srcH: number,
  corners: Point[]
): { pixels: Uint8ClampedArray; w: number; h: number } {
  const CARD_W = 700;
  const CARD_H = 980; // 5:7 ratio
  const margin = Math.round(CARD_W * 0.04);
  const dstW = CARD_W + margin * 2;
  const dstH = CARD_H + margin * 2;

  const dstCorners: Point[] = [
    { x: margin, y: margin },
    { x: margin + CARD_W - 1, y: margin },
    { x: margin + CARD_W - 1, y: margin + CARD_H - 1 },
    { x: margin, y: margin + CARD_H - 1 },
  ];

  const H = solveHomography(dstCorners, corners);
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  // Dark background
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = 30; dst[i + 1] = 30; dst[i + 2] = 30; dst[i + 3] = 255;
  }

  // Bilinear interpolation warp
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const denom = H[6] * dx + H[7] * dy + H[8];
      if (Math.abs(denom) < 1e-10) continue;
      const sx = (H[0] * dx + H[1] * dy + H[2]) / denom;
      const sy = (H[3] * dx + H[4] * dy + H[5]) / denom;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      if (x0 < 0 || x0 + 1 >= srcW || y0 < 0 || y0 + 1 >= srcH) continue;

      const fx = sx - x0, fy = sy - y0;
      const di = (dy * dstW + dx) * 4;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = i00 + 4;
      const i01 = ((y0 + 1) * srcW + x0) * 4;
      const i11 = i01 + 4;

      for (let c = 0; c < 4; c++) {
        dst[di + c] = Math.round(
          srcData[i00 + c] * (1 - fx) * (1 - fy) +
          srcData[i10 + c] * fx * (1 - fy) +
          srcData[i01 + c] * (1 - fx) * fy +
          srcData[i11 + c] * fx * fy
        );
      }
    }
  }

  return { pixels: dst, w: dstW, h: dstH };
}

// ── Skew detection — only warp if perspective is significantly off ──

function checkSkew(corners: Point[], w: number, h: number): boolean {
  // corners: [TL, TR, BR, BL]
  // Compare to axis-aligned bounding rectangle
  const minX = Math.min(corners[0].x, corners[3].x);
  const maxX = Math.max(corners[1].x, corners[2].x);
  const minY = Math.min(corners[0].y, corners[1].y);
  const maxY = Math.max(corners[2].y, corners[3].y);

  const perfect = [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];

  // Max corner deviation from perfect rectangle
  let maxDev = 0;
  for (let i = 0; i < 4; i++) {
    const dev = Math.hypot(corners[i].x - perfect[i].x, corners[i].y - perfect[i].y);
    if (dev > maxDev) maxDev = dev;
  }

  const imgDiag = Math.hypot(w, h);
  const skewRatio = maxDev / imgDiag;

  // Only warp if distortion exceeds 3% of image diagonal
  return skewRatio > 0.03;
}

// ── Worker message handler ──

self.onmessage = (e: MessageEvent) => {
  const { pixels, w, h, doWarp } = e.data;
  const data = new Uint8ClampedArray(pixels);

  try {
    const result = detectEdges(data, w, h);
    if (!result) {
      self.postMessage({ error: "No card edges detected" });
      return;
    }

    const { outer, leftPts, rightPts, topPts, bottomPts } = result;
    const inner = innerBorder(outer);

    // Find corners for perspective warp
    const minPts = 10;
    const hasEnoughPts = leftPts.length >= minPts && rightPts.length >= minPts &&
      topPts.length >= minPts && bottomPts.length >= minPts;

    let corners: Point[] | null = null;
    if (hasEnoughPts) {
      corners = findCorners(leftPts, rightPts, topPts, bottomPts);
    }

    // Only warp if corners show significant perspective distortion
    const needsWarp = doWarp && corners && checkSkew(corners, w, h);

    if (needsWarp && corners) {
      const warped = warpImage(data, w, h, corners);

      // Re-detect on warped image for precise guides
      const warpedResult = detectEdges(warped.pixels, warped.w, warped.h);
      if (warpedResult) {
        const warpedInner = innerBorder(warpedResult.outer);
        const buf = warped.pixels.buffer as ArrayBuffer;
        self.postMessage({
          outer: warpedResult.outer,
          inner: warpedInner,
          warped: { pixels: buf, w: warped.w, h: warped.h },
        }, { transfer: [buf] });
        return;
      }

      // Warp succeeded but re-detection failed — return warped image with original guides
      const buf2 = warped.pixels.buffer as ArrayBuffer;
      self.postMessage({
        outer,
        inner,
        warped: { pixels: buf2, w: warped.w, h: warped.h },
      }, { transfer: [buf2] });
      return;
    }

    self.postMessage({ outer, inner, corners });
  } catch (err: any) {
    self.postMessage({ error: err?.message || "Detection failed" });
  }
};
