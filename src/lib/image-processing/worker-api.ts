/**
 * Main-thread API for the detection Web Worker.
 * Handles image loading, pixel extraction, and worker communication.
 */

import type { GuidePositions } from "@/stores/measurement-store";

export interface WorkerDetectResult {
  outer: GuidePositions;
  inner: GuidePositions;
  warpedSrc?: string; // data URL of warped image (if warp was applied)
}

let worker: Worker | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(
      new URL("./detect-worker.ts", import.meta.url),
      { type: "module" }
    );
  }
  return worker;
}

/**
 * Load an image and extract its pixel data at a target resolution.
 */
function loadPixels(
  imageSrc: string,
  maxDim = 800
): Promise<{ pixels: Uint8ClampedArray; w: number; h: number }> {
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
      const { data } = ctx.getImageData(0, 0, w, h);
      resolve({ pixels: data, w, h });
    };
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = imageSrc;
  });
}

/**
 * Convert raw RGBA pixel data to a data URL via canvas.
 */
function pixelsToDataUrl(
  pixels: Uint8ClampedArray,
  w: number,
  h: number
): string {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const imageData = new ImageData(pixels, w, h);
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Run card edge detection in a Web Worker.
 * Returns guide positions and optionally a warped image.
 */
export function detectInWorker(
  imageSrc: string,
  options: { warp?: boolean } = {}
): Promise<WorkerDetectResult> {
  return new Promise(async (resolve, reject) => {
    try {
      const { pixels, w, h } = await loadPixels(imageSrc, 800);
      const w_ = getWorker();

      const onMessage = (e: MessageEvent) => {
        w_.removeEventListener("message", onMessage);
        w_.removeEventListener("error", onError);

        const result = e.data;
        if (result.error) {
          reject(new Error(result.error));
          return;
        }

        const output: WorkerDetectResult = {
          outer: result.outer,
          inner: result.inner,
        };

        // If warped pixel data was returned, convert to data URL
        if (result.warped) {
          const warpedPixels = new Uint8ClampedArray(result.warped.pixels);
          output.warpedSrc = pixelsToDataUrl(
            warpedPixels,
            result.warped.w,
            result.warped.h
          );
        }

        resolve(output);
      };

      const onError = (e: ErrorEvent) => {
        w_.removeEventListener("message", onMessage);
        w_.removeEventListener("error", onError);
        reject(new Error(e.message || "Worker error"));
      };

      w_.addEventListener("message", onMessage);
      w_.addEventListener("error", onError);

      // Transfer the pixel buffer to the worker (zero-copy)
      w_.postMessage(
        { pixels: pixels.buffer, w, h, doWarp: options.warp ?? false },
        [pixels.buffer]
      );
    } catch (err) {
      reject(err);
    }
  });
}
