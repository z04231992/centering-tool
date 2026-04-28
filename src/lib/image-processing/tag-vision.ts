/**
 * TAG Vision filter — high-pass / emboss-like effect that reveals
 * surface scratches, dents, print defects, and edge wear that are
 * normally invisible against the card design.
 *
 * Algorithm: Subtract a Gaussian blur from the original (unsharp mask
 * residual), shift to mid-gray, and amplify contrast. Result is a
 * neutral-gray image where defects appear as bright/dark detail.
 */

export interface TagVisionOptions {
  /** Blur radius for the high-pass baseline. Larger = more low-frequency removed. */
  radius?: number;
  /** Contrast multiplier on the residual. */
  amplify?: number;
  /** Output as grayscale (true) or preserve color tint (false). */
  grayscale?: boolean;
}

/**
 * Apply TAG Vision filter to an image source.
 * Returns a data URL of the processed image.
 */
export async function applyTagVision(
  imageSrc: string,
  options: TagVisionOptions = {}
): Promise<string> {
  const { radius = 6, amplify = 2.2, grayscale = true } = options;

  const img = await loadImage(imageSrc);
  const maxDim = 1400;
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  const result = tagVisionFilter(imageData, radius, amplify, grayscale);
  ctx.putImageData(result, 0, 0);

  return canvas.toDataURL("image/jpeg", 0.92);
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

/**
 * Core filter: high-pass with mid-gray bias.
 *
 *   out = clamp((original - blur) * amplify + 128)
 */
function tagVisionFilter(
  src: ImageData,
  radius: number,
  amplify: number,
  grayscale: boolean
): ImageData {
  const { width: w, height: h, data } = src;
  const n = w * h;

  // 1. Convert to grayscale luminance buffer
  const gray = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // 2. Box blur (separable, 2 passes ≈ Gaussian)
  const blurred = boxBlur(boxBlur(gray, w, h, radius), w, h, radius);

  // 3. High-pass + amplify + mid-gray bias
  const out = new ImageData(w, h);
  for (let i = 0; i < n; i++) {
    const diff = (gray[i] - blurred[i]) * amplify;
    let v = 128 + diff;
    if (v < 0) v = 0;
    else if (v > 255) v = 255;

    if (grayscale) {
      out.data[i * 4] = v;
      out.data[i * 4 + 1] = v;
      out.data[i * 4 + 2] = v;
    } else {
      // Preserve hue from original by tinting the residual
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b || 1;
      out.data[i * 4] = clamp((r / lum) * v);
      out.data[i * 4 + 1] = clamp((g / lum) * v);
      out.data[i * 4 + 2] = clamp((b / lum) * v);
    }
    out.data[i * 4 + 3] = 255;
  }

  return out;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Separable box blur. Returns a new buffer. */
function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);

  // Horizontal pass
  const winSize = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    const row = y * w;
    // initialize window
    for (let x = -r; x <= r; x++) {
      const xi = Math.max(0, Math.min(w - 1, x));
      sum += src[row + xi];
    }
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum / winSize;
      const xOut = x - r;
      const xIn = x + r + 1;
      const out_i = Math.max(0, Math.min(w - 1, xOut));
      const in_i = Math.max(0, Math.min(w - 1, xIn));
      sum += src[row + in_i] - src[row + out_i];
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) {
      const yi = Math.max(0, Math.min(h - 1, y));
      sum += tmp[yi * w + x];
    }
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / winSize;
      const yOut = y - r;
      const yIn = y + r + 1;
      const out_i = Math.max(0, Math.min(h - 1, yOut));
      const in_i = Math.max(0, Math.min(h - 1, yIn));
      sum += tmp[in_i * w + x] - tmp[out_i * w + x];
    }
  }

  return out;
}
