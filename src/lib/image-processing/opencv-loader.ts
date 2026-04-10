/**
 * Dynamically loads OpenCV.js from CDN.
 * Caches the loaded instance — subsequent calls resolve immediately.
 */

let loadPromise: Promise<any> | null = null;

/** Start loading OpenCV in the background (call early, e.g. on mount). */
export function preloadOpenCV(): void {
  if (!loadPromise) loadPromise = doLoad();
}

/** Load OpenCV and return the cv object. Resolves instantly if already loaded. */
export function loadOpenCV(): Promise<any> {
  if (!loadPromise) loadPromise = doLoad();
  return loadPromise;
}

function doLoad(): Promise<any> {
  return new Promise((resolve, reject) => {
    // Already available
    if ((window as any).cv?.Mat) {
      console.log("[OpenCV] Already loaded");
      resolve((window as any).cv);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.9.0/opencv.js";
    script.async = true;

    const timeout = setTimeout(() => {
      loadPromise = null;
      reject(new Error("OpenCV load timeout (30s)"));
    }, 30000);

    script.onload = () => {
      // Poll for cv.Mat readiness (handles both asm.js and WASM builds)
      const poll = setInterval(() => {
        const _cv = (window as any).cv;
        if (_cv?.Mat) {
          clearInterval(poll);
          clearTimeout(timeout);
          console.log("[OpenCV] Loaded and ready");
          resolve(_cv);
        }
      }, 50);

      // Also set WASM callback if applicable
      try {
        const _cv = (window as any).cv;
        if (_cv && !_cv.Mat && !_cv._cbSet) {
          _cv._cbSet = true;
          _cv.onRuntimeInitialized = () => {
            clearInterval(poll);
            clearTimeout(timeout);
            console.log("[OpenCV] WASM initialized");
            resolve(_cv);
          };
        }
      } catch { /* ignore */ }
    };

    script.onerror = () => {
      clearTimeout(timeout);
      loadPromise = null;
      reject(new Error("Failed to load OpenCV.js from CDN"));
    };

    document.head.appendChild(script);
  });
}
