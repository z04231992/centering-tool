/**
 * Perspective warp: transform a card photo into bird's-eye view.
 *
 * 1. Detect the 4 corners of the card (quadrilateral)
 * 2. Compute a homography matrix (DLT)
 * 3. Warp the image so the card fills a perfect rectangle
 *    using the standard trading card aspect ratio (2.5" × 3.5" = 5:7)
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
 * Solve for the 3×3 homography matrix mapping 4 src points → 4 dst points.
 * Uses Direct Linear Transform (DLT) with normalization for numerical stability.
 *
 * Returns 9-element array [a,b,c, d,e,f, g,h,1] where:
 *   x' = (a*x + b*y + c) / (g*x + h*y + 1)
 *   y' = (d*x + e*y + f) / (g*x + h*y + 1)
 */
function solveHomography(src: Point[], dst: Point[]): number[] {
  // Normalize points for numerical stability
  function normalize(pts: Point[]): { normalized: Point[]; T: number[][] } {
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p.x; cy += p.y; }
    cx /= pts.length; cy /= pts.length;

    let dist = 0;
    for (const p of pts) {
      dist += Math.hypot(p.x - cx, p.y - cy);
    }
    dist /= pts.length;
    const s = Math.SQRT2 / (dist || 1);

    const normalized = pts.map(p => ({ x: s * (p.x - cx), y: s * (p.y - cy) }));
    const T = [
      [s, 0, -s * cx],
      [0, s, -s * cy],
      [0, 0, 1],
    ];
    return { normalized, T };
  }

  const { normalized: srcN, T: Ts } = normalize(src);
  const { normalized: dstN, T: Td } = normalize(dst);

  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = srcN[i];
    const { x: xp, y: yp } = dstN[i];

    A.push([x, y, 1, 0, 0, 0, -xp * x, -xp * y]);
    B.push(xp);
    A.push([0, 0, 0, x, y, 1, -yp * x, -yp * y]);
    B.push(yp);
  }

  // Gaussian elimination on augmented matrix [A|B]
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
    if (Math.abs(pivot) < 1e-12) continue;

    for (let j = col; j <= n; j++) aug[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const hNorm = aug.map((row) => row[n]);

  // Denormalize: H = Td^-1 * Hn * Ts
  const Hn = [
    [hNorm[0], hNorm[1], hNorm[2]],
    [hNorm[3], hNorm[4], hNorm[5]],
    [hNorm[6], hNorm[7], 1],
  ];

  // Td inverse
  const sd = Td[0][0];
  const txd = Td[0][2];
  const tyd = Td[1][2];
  const TdInv = [
    [1 / sd, 0, -txd / sd],
    [0, 1 / sd, -tyd / sd],
    [0, 0, 1],
  ];

  // Matrix multiply: TdInv * Hn * Ts
  function matMul(a: number[][], b: number[][]): number[][] {
    const r: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        for (let k = 0; k < 3; k++)
          r[i][j] += a[i][k] * b[k][j];
    return r;
  }

  const Ts3 = [
    [Ts[0][0], Ts[0][1], Ts[0][2]],
    [Ts[1][0], Ts[1][1], Ts[1][2]],
    [0, 0, 1],
  ];

  const H = matMul(matMul(TdInv, Hn), Ts3);

  // Flatten and normalize so H[2][2] = 1
  const scale = H[2][2] || 1;
  return [
    H[0][0] / scale, H[0][1] / scale, H[0][2] / scale,
    H[1][0] / scale, H[1][1] / scale, H[1][2] / scale,
    H[2][0] / scale, H[2][1] / scale, 1,
  ];
}

/**
 * Fit a line through 2D points using iterative least squares with outlier rejection.
 * Uses RANSAC-like approach: fit, remove outliers (>2.5 MAD), refit.
 */
function fitLine(points: Point[]): { isVertical: boolean; slope: number; intercept: number; avgX: number } {
  const n = points.length;
  if (n < 2) return { isVertical: false, slope: 0, intercept: points[0]?.y ?? 0, avgX: points[0]?.x ?? 0 };

  function lsq(pts: Point[]) {
    let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
    for (const p of pts) {
      sumX += p.x;
      sumY += p.y;
      sumXX += p.x * p.x;
      sumXY += p.x * p.y;
    }
    const denom = pts.length * sumXX - sumX * sumX;
    const avgX = sumX / pts.length;

    if (Math.abs(denom) < 1e-6) {
      return { isVertical: true, slope: 0, intercept: 0, avgX };
    }
    const slope = (pts.length * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / pts.length;
    return { isVertical: false, slope, intercept, avgX };
  }

  let fit = lsq(points);
  if (fit.isVertical) return fit;

  // Two rounds of outlier rejection for more robust fits
  for (let round = 0; round < 2; round++) {
    const residuals = points.map(p => Math.abs(p.y - (fit.slope * p.x + fit.intercept)));
    const sortedRes = [...residuals].sort((a, b) => a - b);
    const medianRes = sortedRes[Math.floor(sortedRes.length / 2)];
    const mad = Math.max(0.5, medianRes * 1.4826);

    const inliers = points.filter((_, i) => residuals[i] < 2.5 * mad);
    if (inliers.length >= Math.max(3, n * 0.3)) {
      fit = lsq(inliers);
      if (fit.isVertical) return fit;
    }
  }

  return fit;
}

/**
 * Detect the 4 corners of the card by fitting lines through edge scan points
 * and finding their intersections.
 *
 * Returns 4 corners in order: [topLeft, topRight, bottomRight, bottomLeft]
 */
export function detectCorners(
  leftEdges: Point[],
  rightEdges: Point[],
  topEdges: Point[],
  bottomEdges: Point[]
): Point[] {
  // Left/Right: x = f(y), so swap x/y for fitting, then swap back
  const leftLineXofY = fitLine(leftEdges.map((p) => ({ x: p.y, y: p.x })));
  const rightLineXofY = fitLine(rightEdges.map((p) => ({ x: p.y, y: p.x })));
  // Top/Bottom: y = f(x), standard fit
  const topLineYofX = fitLine(topEdges);
  const bottomLineYofX = fitLine(bottomEdges);

  function findCorner(
    edgeLine: { isVertical: boolean; slope: number; intercept: number; avgX: number },
    borderLine: { isVertical: boolean; slope: number; intercept: number; avgX: number }
  ): Point {
    // edgeLine: x = es*y + ei
    // borderLine: y = bs*x + bi
    // Substituting: y = bs*(es*y + ei) + bi = bs*es*y + bs*ei + bi
    // y(1 - bs*es) = bs*ei + bi
    const es = edgeLine.isVertical ? 0 : edgeLine.slope;
    const ei = edgeLine.isVertical ? edgeLine.avgX : edgeLine.intercept;
    const bs = borderLine.isVertical ? 0 : borderLine.slope;
    const bi = borderLine.isVertical ? borderLine.avgX : borderLine.intercept;

    const denom = 1 - bs * es;
    if (Math.abs(denom) < 1e-10) {
      const y = bi;
      const x = es * y + ei;
      return { x, y };
    }

    const y = (bs * ei + bi) / denom;
    const x = es * y + ei;
    return { x, y };
  }

  const topLeft = findCorner(leftLineXofY, topLineYofX);
  const topRight = findCorner(rightLineXofY, topLineYofX);
  const bottomRight = findCorner(rightLineXofY, bottomLineYofX);
  const bottomLeft = findCorner(leftLineXofY, bottomLineYofX);

  return [topLeft, topRight, bottomRight, bottomLeft];
}

/**
 * Ensure corners are in correct order [TL, TR, BR, BL].
 * Sorts by position to handle any detection order issues.
 */
function orderCorners(corners: Point[]): Point[] {
  // Sort by y to get top pair and bottom pair
  const sorted = [...corners].sort((a, b) => a.y - b.y);
  const topPair = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottomPair = sorted.slice(2, 4).sort((a, b) => a.x - b.x);

  return [topPair[0], topPair[1], bottomPair[1], bottomPair[0]]; // TL, TR, BR, BL
}

/**
 * Warp an image so the card becomes a perfect rectangle.
 *
 * Key improvement: uses standard trading card aspect ratio (2.5" × 3.5" = 5:7)
 * instead of trying to infer dimensions from the (potentially distorted) corners.
 * This produces a clean, professional-looking warp like the competitors.
 *
 * Output resolution: 900×1260 (5:7 ratio) with 3% margin.
 */
export function warpToRectangle(
  srcData: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  corners: Point[]
): string {
  // Order corners correctly
  const ordered = orderCorners(corners);

  // Standard trading card: 2.5" × 3.5" = 5:7 ratio
  const CARD_W = 900;
  const CARD_H = 1260; // 900 * 7/5

  // Small margin (3%) so the card edges are visible
  const marginX = Math.round(CARD_W * 0.03);
  const marginY = Math.round(CARD_H * 0.03);
  const dstW = CARD_W + marginX * 2;
  const dstH = CARD_H + marginY * 2;

  // Destination: card fills the rectangle with margin
  const dstCorners: Point[] = [
    { x: marginX, y: marginY },                     // TL
    { x: marginX + CARD_W - 1, y: marginY },        // TR
    { x: marginX + CARD_W - 1, y: marginY + CARD_H - 1 }, // BR
    { x: marginX, y: marginY + CARD_H - 1 },        // BL
  ];

  // Homography: dst pixel → src pixel (inverse mapping)
  const H = solveHomography(dstCorners, ordered);

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d")!;

  const dstImageData = ctx.createImageData(dstW, dstH);
  const dst = dstImageData.data;

  // Fill with dark background
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = 30; dst[i + 1] = 30; dst[i + 2] = 30; dst[i + 3] = 255;
  }

  // Inverse warp with bilinear interpolation
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
