/**
 * Perspective warp: transform a card photo into bird's-eye view.
 *
 * Like the competitor's "Warp card for better accuracy" feature:
 * 1. Detect the 4 corners of the card (quadrilateral)
 * 2. Compute a homography matrix
 * 3. Warp the image so the card is a perfect rectangle
 *
 * This eliminates camera perspective distortion, making border
 * measurements much more accurate.
 */

export interface Point {
  x: number;
  y: number;
}

export interface WarpResult {
  /** Data URL of the warped image */
  dataUrl: string;
  /** The 4 detected corners in the original image [TL, TR, BR, BL] */
  corners: Point[];
  /** Width/height of the warped output */
  width: number;
  height: number;
}

/**
 * Solve for the 3x3 homography matrix mapping 4 src points to 4 dst points.
 * Uses Direct Linear Transform (DLT) with Gaussian elimination.
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

  // Gaussian elimination on augmented matrix [A|B]
  const n = 8;
  const aug = A.map((row, i) => [...row, B[i]]);

  for (let col = 0; col < n; col++) {
    // Partial pivoting
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
 * Fit a line through 2D points using iterative least squares with outlier rejection.
 * First fits all points, then removes outliers (>2 MAD from line), refits.
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

  // First pass: fit all points
  let fit = lsq(points);
  if (fit.isVertical) return fit;

  // Compute residuals
  const residuals = points.map(p => Math.abs(p.y - (fit.slope * p.x + fit.intercept)));
  const sortedRes = [...residuals].sort((a, b) => a - b);
  const medianRes = sortedRes[Math.floor(sortedRes.length / 2)];
  const mad = Math.max(1, medianRes * 1.4826); // MAD to std estimate

  // Remove outliers (> 2 MAD)
  const inliers = points.filter((_, i) => residuals[i] < 2.5 * mad);

  if (inliers.length >= Math.max(3, n * 0.4)) {
    fit = lsq(inliers);
  }

  return fit;
}

/**
 * Detect the 4 corners of the card by fitting lines through edge scan points
 * and finding their intersections.
 *
 * @param leftEdges - array of {x, y} points along the left edge
 * @param rightEdges - array of {x, y} points along the right edge
 * @param topEdges - array of {x, y} points along the top edge
 * @param bottomEdges - array of {x, y} points along the bottom edge
 * @returns 4 corners in order: [topLeft, topRight, bottomRight, bottomLeft]
 */
export function detectCorners(
  leftEdges: Point[],
  rightEdges: Point[],
  topEdges: Point[],
  bottomEdges: Point[]
): Point[] {
  // For left/right edges, we have (edgeX, scanY) points
  // The line is: x = f(y), so we fit x = slope*y + intercept
  // But fitLine assumes y = slope*x + intercept
  // So for left/right, we swap x and y in the input, then swap back for intersection
  // Left/Right: we want x as function of y → fit with y as "x" input, x as "y" output
  const leftLineXofY = fitLine(leftEdges.map((p) => ({ x: p.y, y: p.x })));
  const rightLineXofY = fitLine(rightEdges.map((p) => ({ x: p.y, y: p.x })));
  // Top/Bottom: we want y as function of x → standard fit
  const topLineYofX = fitLine(topEdges);
  const bottomLineYofX = fitLine(bottomEdges);

  // Find corners by substitution
  // Top-left: intersection of left edge and top edge
  // Left: x = leftSlope * y + leftIntercept
  // Top:  y = topSlope * x + topIntercept
  // Substituting: y = topSlope * (leftSlope * y + leftIntercept) + topIntercept
  // y = topSlope*leftSlope*y + topSlope*leftIntercept + topIntercept
  // y(1 - topSlope*leftSlope) = topSlope*leftIntercept + topIntercept
  function findCorner(
    edgeLine: { isVertical: boolean; slope: number; intercept: number; avgX: number },
    borderLine: { isVertical: boolean; slope: number; intercept: number; avgX: number }
  ): Point {
    // edgeLine: x = es*y + ei (fitted as y=slope*x+intercept where x→y, y→x)
    // So: x = edgeLine.slope * y + edgeLine.intercept
    // borderLine: y = bs*x + bi
    // Substituting: y = bs*(es*y + ei) + bi = bs*es*y + bs*ei + bi
    // y(1 - bs*es) = bs*ei + bi
    const es = edgeLine.isVertical ? 0 : edgeLine.slope;
    const ei = edgeLine.isVertical ? edgeLine.avgX : edgeLine.intercept;
    const bs = borderLine.isVertical ? 0 : borderLine.slope;
    const bi = borderLine.isVertical ? borderLine.avgX : borderLine.intercept;

    const denom = 1 - bs * es;
    if (Math.abs(denom) < 1e-10) {
      // Fallback
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
 * High-level: warp an image so the card becomes a rectangle.
 * Takes the original image and detected corner positions.
 * Returns the warped image as a data URL.
 *
 * Adds a small margin around the card (5%) so borders are visible,
 * and outputs at a high resolution for clarity.
 */
export function warpToRectangle(
  srcData: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  corners: Point[]
): string {
  // Compute card dimensions from corners
  const topWidth = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
  const bottomWidth = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
  const leftHeight = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
  const rightHeight = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);

  const avgWidth = (topWidth + bottomWidth) / 2;
  const avgHeight = (leftHeight + rightHeight) / 2;

  // Output at high resolution — scale up to at least 800px wide
  const scaleFactor = Math.max(1, 800 / avgWidth);
  const cardW = Math.round(avgWidth * scaleFactor);
  const cardH = Math.round(avgHeight * scaleFactor);

  // Add 5% margin around the card so borders are fully visible
  const marginX = Math.round(cardW * 0.05);
  const marginY = Math.round(cardH * 0.05);
  const dstW = cardW + marginX * 2;
  const dstH = cardH + marginY * 2;

  // Destination corners with margin offset
  const dstCorners: Point[] = [
    { x: marginX, y: marginY },
    { x: marginX + cardW - 1, y: marginY },
    { x: marginX + cardW - 1, y: marginY + cardH - 1 },
    { x: marginX, y: marginY + cardH - 1 },
  ];

  // Compute homography: dst → src (inverse mapping)
  const H = solveHomography(dstCorners, corners);

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;
  const ctx = canvas.getContext("2d")!;

  // Fill with dark background for margins
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, dstW, dstH);

  const dstImageData = ctx.createImageData(dstW, dstH);
  const dst = dstImageData.data;

  // Fill background
  for (let i = 0; i < dst.length; i += 4) {
    dst[i] = 17; dst[i + 1] = 17; dst[i + 2] = 17; dst[i + 3] = 255;
  }

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const denom = H[6] * dx + H[7] * dy + H[8];
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
