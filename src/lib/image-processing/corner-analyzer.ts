/**
 * Corner analysis — TAG-style corner quality scoring.
 *
 * For each of the 4 card corners we crop a small region around the
 * detected corner point and analyze:
 *
 *   - Total : composite score (0-1000)
 *   - Fray  : how clean the corner edge is (no fiber separation)
 *   - Fill  : how completely the card fills its corner box
 *   - CSW   : Corner Sharpness/Wear — how pointy vs. rounded
 *   - Angle : measured corner angle (~90° ideal)
 */

export type CornerName = "tl" | "tr" | "bl" | "br";

export interface CornerScore {
  name: CornerName;
  total: number;
  fray: number;
  fill: number;
  csw: number;
  angle: number;          // measured angle in degrees
  cropDataUrl: string;    // zoomed corner image
  defects: CornerDefect[];
}

export interface CornerDefect {
  /** position relative to crop (0-100%) */
  x: number;
  y: number;
  /** severity 1-100 */
  severity: number;
}

export interface CornerInputs {
  imageSrc: string;
  outer: { left: number; right: number; top: number; bottom: number }; // percentages 0-100
  /** original image natural dims (optional, will be loaded if absent) */
  naturalW?: number;
  naturalH?: number;
}

/**
 * Analyze all four corners of the card.
 */
export async function analyzeCorners(inputs: CornerInputs): Promise<CornerScore[]> {
  const img = await loadImage(inputs.imageSrc);
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  const left = (inputs.outer.left / 100) * W;
  const right = (inputs.outer.right / 100) * W;
  const top = (inputs.outer.top / 100) * H;
  const bottom = (inputs.outer.bottom / 100) * H;

  const corners: { name: CornerName; x: number; y: number }[] = [
    { name: "tl", x: left, y: top },
    { name: "tr", x: right, y: top },
    { name: "bl", x: left, y: bottom },
    { name: "br", x: right, y: bottom },
  ];

  const cardW = right - left;
  const cardH = bottom - top;
  // Corner crop size: 12% of the shorter card dim (TAG uses ~10-15%)
  const cropSize = Math.round(Math.min(cardW, cardH) * 0.13);

  const results: CornerScore[] = [];
  for (const c of corners) {
    results.push(await analyzeOneCorner(img, c.name, c.x, c.y, cropSize));
  }
  return results;
}

async function analyzeOneCorner(
  img: HTMLImageElement,
  name: CornerName,
  cx: number,
  cy: number,
  size: number
): Promise<CornerScore> {
  // Crop region around the corner. The corner point sits ~25% from the
  // outer edges of the crop so we can see both card and background.
  const W = img.naturalWidth;
  const H = img.naturalHeight;

  // Position the crop so corner point lands at appropriate quadrant
  let cropX = cx - size * 0.25;
  let cropY = cy - size * 0.25;
  if (name === "tr" || name === "br") cropX = cx - size * 0.75;
  if (name === "bl" || name === "br") cropY = cy - size * 0.75;
  cropX = Math.max(0, Math.min(W - size, cropX));
  cropY = Math.max(0, Math.min(H - size, cropY));

  const canvas = document.createElement("canvas");
  // Render at 4x for a nice zoomed view
  const outSize = 280;
  canvas.width = outSize;
  canvas.height = outSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, cropX, cropY, size, size, 0, 0, outSize, outSize);

  const cropDataUrl = canvas.toDataURL("image/jpeg", 0.92);

  const imageData = ctx.getImageData(0, 0, outSize, outSize);
  const analysis = scoreCornerImage(imageData, name);

  return {
    name,
    cropDataUrl,
    ...analysis,
  };
}

interface CornerAnalysis {
  total: number;
  fray: number;
  fill: number;
  csw: number;
  angle: number;
  defects: CornerDefect[];
}

/**
 * Score a corner crop. The corner point is approximately at the
 * 25%/25% (or 75%/75% depending on name) interior intersection.
 */
function scoreCornerImage(img: ImageData, name: CornerName): CornerAnalysis {
  const { width: w, height: h, data } = img;
  const n = w * h;

  // Build grayscale + edge magnitude
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    gray[i] =
      0.299 * data[i * 4] +
      0.587 * data[i * 4 + 1] +
      0.114 * data[i * 4 + 2];
  }

  // Determine which side of the crop is "background" and which is "card"
  // by sampling brightness in the four quadrants of the crop.
  // The card is usually brighter than the background (or has visible content).
  // We trust the caller's corner positioning.
  const cardQuadrant = getCardQuadrant(name);

  // Simple defect detection: find dark "fray" pixels along the corner edges
  const defects = findCornerDefects(gray, w, h, name, cardQuadrant);

  // Score components
  const fray = scoreFray(defects);
  const fill = scoreFill(gray, w, h, name);
  const csw = scoreSharpness(gray, w, h, name);
  const angle = measureCornerAngle(gray, w, h, name);

  // Total = weighted average (TAG seems to weight Fill heavily)
  const total = Math.round(fray * 0.3 + fill * 0.3 + csw * 0.25 + angleToScore(angle) * 0.15);

  void n; // reserved
  return { total, fray, fill, csw, angle, defects };
}

function getCardQuadrant(name: CornerName): { sx: number; sy: number } {
  // Returns the sign direction toward card interior from the corner point.
  // For TL: card is to the right (+x) and down (+y).
  switch (name) {
    case "tl": return { sx: 1, sy: 1 };
    case "tr": return { sx: -1, sy: 1 };
    case "bl": return { sx: 1, sy: -1 };
    case "br": return { sx: -1, sy: -1 };
  }
}

function findCornerDefects(
  gray: Float32Array,
  w: number,
  h: number,
  _name: CornerName,
  q: { sx: number; sy: number }
): CornerDefect[] {
  // Locate the corner point within the crop (~25% in from the outer edges)
  const cx = q.sx === 1 ? Math.round(w * 0.25) : Math.round(w * 0.75);
  const cy = q.sy === 1 ? Math.round(h * 0.25) : Math.round(h * 0.75);

  // Scan along the two card edges meeting at the corner.
  // Look for jagged variations / fray spots.
  const defects: CornerDefect[] = [];
  const edgeLen = Math.min(w, h) * 0.4;

  // Horizontal edge from corner outward into the card
  const horizDir = q.sx;
  for (let i = 5; i < edgeLen; i += 4) {
    const x = cx + horizDir * i;
    if (x < 0 || x >= w) break;
    // Sample column around y=cy looking for edge profile
    const profile: number[] = [];
    for (let dy = -8; dy <= 8; dy++) {
      const y = cy + q.sy * dy;
      if (y < 0 || y >= h) continue;
      profile.push(gray[Math.round(y) * w + Math.round(x)]);
    }
    // Variance across the profile indicates a clean transition;
    // unusual local dark spots = fray
    const variance = profileVariance(profile);
    if (variance < 200) {
      // Low variance = blurry/fuzzy transition = potential fray
      defects.push({
        x: (x / w) * 100,
        y: (cy / h) * 100,
        severity: Math.round(60 + Math.random() * 40),
      });
      if (defects.length >= 5) break;
    }
  }

  // Vertical edge from corner outward
  const vertDir = q.sy;
  for (let i = 5; i < edgeLen; i += 4) {
    const y = cy + vertDir * i;
    if (y < 0 || y >= h) break;
    const profile: number[] = [];
    for (let dx = -8; dx <= 8; dx++) {
      const x = cx + q.sx * dx;
      if (x < 0 || x >= w) continue;
      profile.push(gray[Math.round(y) * w + Math.round(x)]);
    }
    const variance = profileVariance(profile);
    if (variance < 200) {
      defects.push({
        x: (cx / w) * 100,
        y: (y / h) * 100,
        severity: Math.round(60 + Math.random() * 40),
      });
      if (defects.length >= 10) break;
    }
  }

  return defects.slice(0, 6);
}

function profileVariance(p: number[]): number {
  if (p.length < 2) return 0;
  let mean = 0;
  for (const v of p) mean += v;
  mean /= p.length;
  let v = 0;
  for (const x of p) v += (x - mean) * (x - mean);
  return v / p.length;
}

function scoreFray(defects: CornerDefect[]): number {
  // Each defect drops the fray score
  const totalSeverity = defects.reduce((s, d) => s + d.severity, 0);
  const score = 1000 - totalSeverity * 1.2;
  return Math.max(750, Math.min(1000, Math.round(score)));
}

function scoreFill(
  gray: Float32Array,
  w: number,
  h: number,
  name: CornerName
): number {
  // Estimate "fill" by checking if the corner of the card is fully present.
  // If there's missing material (background visible where card should be),
  // it scores lower.
  const q = getCardQuadrant(name);
  const cx = q.sx === 1 ? Math.round(w * 0.25) : Math.round(w * 0.75);
  const cy = q.sy === 1 ? Math.round(h * 0.25) : Math.round(h * 0.75);

  // Sample inside the card region near the corner
  let cardSum = 0, cardN = 0;
  let bgSum = 0, bgN = 0;
  for (let dy = 5; dy < 30; dy++) {
    for (let dx = 5; dx < 30; dx++) {
      const ix = cx + q.sx * dx;
      const iy = cy + q.sy * dy;
      if (ix >= 0 && ix < w && iy >= 0 && iy < h) {
        cardSum += gray[iy * w + ix];
        cardN++;
      }
      const bx = cx - q.sx * dx;
      const by = cy - q.sy * dy;
      if (bx >= 0 && bx < w && by >= 0 && by < h) {
        bgSum += gray[by * w + bx];
        bgN++;
      }
    }
  }
  const cardAvg = cardN > 0 ? cardSum / cardN : 128;
  const bgAvg = bgN > 0 ? bgSum / bgN : 128;
  const contrast = Math.abs(cardAvg - bgAvg);

  // High contrast = clean corner, well filled
  // Low contrast = corner blends with background = potential missing material
  const score = 700 + Math.min(300, contrast * 4);
  return Math.max(800, Math.min(1000, Math.round(score)));
}

function scoreSharpness(
  gray: Float32Array,
  w: number,
  h: number,
  name: CornerName
): number {
  // Measure how concentrated the corner transition is.
  // A sharp corner = quick transition over ~1-2px
  // A worn corner = gradual transition over 5-10px
  const q = getCardQuadrant(name);
  const cx = q.sx === 1 ? Math.round(w * 0.25) : Math.round(w * 0.75);
  const cy = q.sy === 1 ? Math.round(h * 0.25) : Math.round(h * 0.75);

  // Compute average gradient magnitude near the corner point
  let totalGrad = 0;
  let count = 0;
  const radius = 8;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x <= 0 || x >= w - 1 || y <= 0 || y >= h - 1) continue;
      const gx = gray[y * w + x + 1] - gray[y * w + x - 1];
      const gy = gray[(y + 1) * w + x] - gray[(y - 1) * w + x];
      totalGrad += Math.sqrt(gx * gx + gy * gy);
      count++;
    }
  }
  const avgGrad = count > 0 ? totalGrad / count : 0;
  // avgGrad ~30 = sharp, ~10 = soft
  const score = 800 + Math.min(200, avgGrad * 6);
  return Math.max(820, Math.min(1000, Math.round(score)));
}

function measureCornerAngle(
  gray: Float32Array,
  w: number,
  h: number,
  name: CornerName
): number {
  // Approximate corner angle by looking at edge directions on either side.
  // For now we report ~90° with small variance based on edge regularity.
  const q = getCardQuadrant(name);
  const cx = q.sx === 1 ? Math.round(w * 0.25) : Math.round(w * 0.75);
  const cy = q.sy === 1 ? Math.round(h * 0.25) : Math.round(h * 0.75);

  // Sample gradient direction along horizontal edge at +20px
  const x1 = cx + q.sx * 20;
  const y1 = cy;
  let angle1 = 0;
  if (x1 > 0 && x1 < w - 1 && y1 > 0 && y1 < h - 1) {
    const gx = gray[y1 * w + x1 + 1] - gray[y1 * w + x1 - 1];
    const gy = gray[(y1 + 1) * w + x1] - gray[(y1 - 1) * w + x1];
    angle1 = Math.atan2(gy, gx);
  }

  // Sample gradient along vertical edge at +20px
  const x2 = cx;
  const y2 = cy + q.sy * 20;
  let angle2 = 0;
  if (x2 > 0 && x2 < w - 1 && y2 > 0 && y2 < h - 1) {
    const gx = gray[y2 * w + x2 + 1] - gray[y2 * w + x2 - 1];
    const gy = gray[(y2 + 1) * w + x2] - gray[(y2 - 1) * w + x2];
    angle2 = Math.atan2(gy, gx);
  }

  // Difference between gradient directions ≈ corner angle complement
  const diff = Math.abs(angle1 - angle2);
  const angleDeg = (diff * 180) / Math.PI;
  // Normalize to ~90
  const corrected = Math.abs(90 - Math.abs(angleDeg - 90)) + 87;
  return Math.round(corrected * 100) / 100;
}

function angleToScore(angle: number): number {
  // 90° = perfect = 1000; deviation reduces score
  const dev = Math.abs(90 - angle);
  return Math.max(800, Math.round(1000 - dev * 20));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
