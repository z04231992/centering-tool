/**
 * Perspective warp: transform a card photo into bird's-eye view.
 *
 * 1. Detect the 4 corners of the card (quadrilateral)
 * 2. Compute a homography matrix (DLT)
 * 3. Warp to standard trading card aspect ratio (2.5" × 3.5" = 5:7)
 */

export interface Point {
  x: number;
  y: number;
}

export interface WarpResult {
  dataUrl: string;
  corners: Point[];
  width: number;
  height: number;
}

/**
 * Solve 3×3 homography: 4 src points → 4 dst points via DLT + Gaussian elimination.
 *
 * Returns 9-element array [a,b,c, d,e,f, g,h,1] where:
 *   x' = (a*x + b*y + c) / (g*x + h*y + 1)
 *   y' = (d*x + e*y + f) / (g*x + h*y + 1)
 */
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
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-10) continue;

    for (let j = col; j <= n; j++) aug[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const h = aug.map((row) => row[n]);
  return [...h, 1];
}

/**
 * Fit a line y = slope*x + intercept with two rounds of outlier rejection.
 */
function fitLine(points: Point[]): { isVertical: boolean; slope: number; intercept: number; avgX: number } {
  const n = points.length;
  if (n < 2) return { isVertical: false, slope: 0, intercept: points[0]?.y ?? 0, avgX: points[0]?.x ?? 0 };

  function lsq(pts: Point[]) {
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    for (const p of pts) {
      sumX += p.x; sumY += p.y;
      sumXX += p.x * p.x; sumXY += p.x * p.y;
    }
    const denom = pts.length * sumXX - sumX * sumX;
    const avgX = sumX / pts.length;
    if (Math.abs(denom) < 1e-6) return { isVertical: true, slope: 0, intercept: 0, avgX };
    const slope = (pts.length * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / pts.length;
    return { isVertical: false, slope, intercept, avgX };
  }

  let fit = lsq(points);
  if (fit.isVertical) return fit;

  // Two rounds of outlier rejection
  let currentPts = points;
  for (let round = 0; round < 2; round++) {
    const residuals = currentPts.map(p => Math.abs(p.y - (fit.slope * p.x + fit.intercept)));
    const sortedRes = [...residuals].sort((a, b) => a - b);
    const medianRes = sortedRes[Math.floor(sortedRes.length / 2)];
    const mad = Math.max(0.5, medianRes * 1.4826);

    const inliers = currentPts.filter((_, i) => residuals[i] < 2.5 * mad);
    if (inliers.length >= Math.max(3, n * 0.3)) {
      currentPts = inliers;
      fit = lsq(inliers);
      if (fit.isVertical) return fit;
    }
  }

  return fit;
}

/**
 * Detect 4 corners by fitting lines through edge scan points and finding intersections.
 * Returns [topLeft, topRight, bottomRight, bottomLeft].
 */
export function detectCorners(
  leftEdges: Point[],
  rightEdges: Point[],
  topEdges: Point[],
  bottomEdges: Point[]
): Point[] {
  // Left/Right: x = f(y), so swap x/y for fitting
  const leftLineXofY = fitLine(leftEdges.map(p => ({ x: p.y, y: p.x })));
  const rightLineXofY = fitLine(rightEdges.map(p => ({ x: p.y, y: p.x })));
  // Top/Bottom: y = f(x), standard fit
  const topLineYofX = fitLine(topEdges);
  const bottomLineYofX = fitLine(bottomEdges);

  function findCorner(
    edgeLine: { isVertical: boolean; slope: number; intercept: number; avgX: number },
    borderLine: { isVertical: boolean; slope: number; intercept: number; avgX: number }
  ): Point {
    const es = edgeLine.isVertical ? 0 : edgeLine.slope;
    const ei = edgeLine.isVertical ? edgeLine.avgX : edgeLine.intercept;
    const bs = borderLine.isVertical ? 0 : borderLine.slope;
    const bi = borderLine.isVertical ? borderLine.avgX : borderLine.intercept;

    const denom = 1 - bs * es;
    if (Math.abs(denom) < 1e-10) {
      return { x: es * bi + ei, y: bi };
    }
    const y = (bs * ei + bi) / denom;
    const x = es * y + ei;
    return { x, y };
  }

  return [
    findCorner(leftLineXofY, topLineYofX),     // TL
    findCorner(rightLineXofY, topLineYofX),     // TR
    findCorner(rightLineXofY, bottomLineYofX),  // BR
    findCorner(leftLineXofY, bottomLineYofX),   // BL
  ];
}

/**
 * Warp image so the card becomes a perfect rectangle.
 * Uses standard trading card ratio (2.5" × 3.5" = 5:7).
 * Output: 900×1260 with 3% margin.
 */
export function warpToRectangle(
  srcData: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  corners: Point[] // [TL, TR, BR, BL] — already ordered by detectCorners
): string {
  // Standard trading card: 2.5" × 3.5" = 5:7
  const CARD_W = 900;
  const CARD_H = 1260;

  // 3% margin so card edges are visible
  const marginX = Math.round(CARD_W * 0.03);
  const marginY = Math.round(CARD_H * 0.03);
  const dstW = CARD_W + marginX * 2;
  const dstH = CARD_H + marginY * 2;

  // Destination rectangle with margin
  const dstCorners: Point[] = [
    { x: marginX, y: marginY },                              // TL
    { x: marginX + CARD_W - 1, y: marginY },                 // TR
    { x: marginX + CARD_W - 1, y: marginY + CARD_H - 1 },   // BR
    { x: marginX, y: marginY + CARD_H - 1 },                 // BL
  ];

  // Inverse mapping: dst → src
  const H = solveHomography(dstCorners, corners);

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d")!;

  const dstImageData = ctx.createImageData(dstW, dstH);
  const dst = dstImageData.data;

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

      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);

      if (x0 < 0 || x0 + 1 >= srcW || y0 < 0 || y0 + 1 >= srcH) continue;

      const fx = sx - x0;
      const fy = sy - y0;
      const di = (dy * dstW + dx) * 4;
      const i00 = (y0 * srcW + x0) * 4;
      const i10 = (y0 * srcW + x0 + 1) * 4;
      const i01 = ((y0 + 1) * srcW + x0) * 4;
      const i11 = ((y0 + 1) * srcW + x0 + 1) * 4;

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

  ctx.putImageData(dstImageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}
