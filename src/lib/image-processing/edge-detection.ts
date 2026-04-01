/**
 * Client-side edge detection pipeline ported from crimsonthinker/psa_pokemon_cards.
 * Uses Sobel gradient + Canny-style edge detection + contour finding
 * to automatically detect card boundaries in uploaded images.
 */

/** Convert image data to grayscale float array */
export function toGrayscale(imageData: ImageData): Float32Array {
  const { data, width, height } = imageData;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/** Apply 5x5 Gaussian blur to reduce noise */
export function gaussianBlur(src: Float32Array, width: number, height: number): Float32Array {
  const kernel = [
    1, 4, 7, 4, 1,
    4, 16, 26, 16, 4,
    7, 26, 41, 26, 7,
    4, 16, 26, 16, 4,
    1, 4, 7, 4, 1,
  ];
  const kSum = 273;
  const out = new Float32Array(width * height);

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      let sum = 0;
      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          sum += src[(y + ky) * width + (x + kx)] * kernel[(ky + 2) * 5 + (kx + 2)];
        }
      }
      out[y * width + x] = sum / kSum;
    }
  }
  return out;
}

/** Compute Sobel gradients (Gx, Gy) and gradient magnitude + direction */
export function sobelGradient(
  gray: Float32Array,
  width: number,
  height: number
): { magnitude: Float32Array; direction: Float32Array } {
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      // Sobel X kernel
      const gx =
        -gray[(y - 1) * width + (x - 1)] + gray[(y - 1) * width + (x + 1)] +
        -2 * gray[y * width + (x - 1)] + 2 * gray[y * width + (x + 1)] +
        -gray[(y + 1) * width + (x - 1)] + gray[(y + 1) * width + (x + 1)];
      // Sobel Y kernel
      const gy =
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
        gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];

      magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      direction[idx] = Math.atan2(gy, gx);
    }
  }
  return { magnitude, direction };
}

/** Non-maximum suppression - thin edges to 1px wide */
function nonMaxSuppression(
  magnitude: Float32Array,
  direction: Float32Array,
  width: number,
  height: number
): Float32Array {
  const out = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const angle = ((direction[idx] * 180) / Math.PI + 180) % 180;
      let n1 = 0, n2 = 0;

      if (angle < 22.5 || angle >= 157.5) {
        n1 = magnitude[y * width + (x - 1)];
        n2 = magnitude[y * width + (x + 1)];
      } else if (angle < 67.5) {
        n1 = magnitude[(y - 1) * width + (x + 1)];
        n2 = magnitude[(y + 1) * width + (x - 1)];
      } else if (angle < 112.5) {
        n1 = magnitude[(y - 1) * width + x];
        n2 = magnitude[(y + 1) * width + x];
      } else {
        n1 = magnitude[(y - 1) * width + (x - 1)];
        n2 = magnitude[(y + 1) * width + (x + 1)];
      }

      out[idx] = magnitude[idx] >= n1 && magnitude[idx] >= n2 ? magnitude[idx] : 0;
    }
  }
  return out;
}

/** Canny-style double threshold + hysteresis edge detection */
export function cannyEdgeDetect(
  gray: Float32Array,
  width: number,
  height: number,
  lowThreshold = 30,
  highThreshold = 80
): Uint8Array {
  const blurred = gaussianBlur(gray, width, height);
  const { magnitude, direction } = sobelGradient(blurred, width, height);
  const suppressed = nonMaxSuppression(magnitude, direction, width, height);

  const edges = new Uint8Array(width * height);
  const STRONG = 255;
  const WEAK = 128;

  // Double threshold
  for (let i = 0; i < width * height; i++) {
    if (suppressed[i] >= highThreshold) edges[i] = STRONG;
    else if (suppressed[i] >= lowThreshold) edges[i] = WEAK;
  }

  // Hysteresis: promote weak edges connected to strong edges
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (edges[idx] !== WEAK) continue;
        // Check 8-neighbors for strong edge
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (edges[(y + dy) * width + (x + dx)] === STRONG) {
              edges[idx] = STRONG;
              changed = true;
              break;
            }
          }
          if (edges[idx] === STRONG) break;
        }
      }
    }
  }

  // Remove remaining weak edges
  for (let i = 0; i < width * height; i++) {
    if (edges[i] !== STRONG) edges[i] = 0;
  }

  return edges;
}

/**
 * Otsu thresholding - automatically find optimal threshold for binarization.
 * Good for well-lit card photos. Ported from the PSA repo's light-image fallback.
 */
export function otsuThreshold(gray: Float32Array, width: number, height: number): Uint8Array {
  const total = width * height;
  const histogram = new Int32Array(256);
  for (let i = 0; i < total; i++) {
    histogram[Math.round(Math.min(255, Math.max(0, gray[i])))]++;
  }

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];

  let sumB = 0, wB = 0, wF = 0;
  let maxVariance = 0, threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const variance = wB * wF * (mB - mF) * (mB - mF);

    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = t;
    }
  }

  const result = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    result[i] = gray[i] > threshold ? 255 : 0;
  }
  return result;
}
