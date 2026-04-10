/**
 * Dynamically loads OpenCV.js from CDN.
 * Handles the factory pattern used in OpenCV.js 4.5.5+.
 * Caches the loaded instance — subsequent calls resolve immediately.
 */

let loadPromise: Promise<any> | null = null;
let cvInstance: any = null;

/** Start loading OpenCV in the background (call early, e.g. on mount). */
export function preloadOpenCV(): void {
  if (!loadPromise) loadPromise = doLoad();
}

/** Load OpenCV and return the cv object. Resolves instantly if already loaded. */
export function loadOpenCV(): Promise<any> {
  if (cvInstance) return Promise.resolve(cvInstance);
  if (!loadPromise) loadPromise = doLoad();
  return loadPromise;
}

function doLoad(): Promise<any> {
  return new Promise((resolve, reject) => {
    // Already available
    if (cvInstance) {
      resolve(cvInstance);
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
      const init = async () => {
        try {
          let _cv = (window as any).cv;

          if (!_cv) {
            throw new Error("cv not defined after script load");
          }

          // OpenCV.js 4.5.5+ uses a factory pattern:
          // cv is a function that returns a Promise<Module>
          if (typeof _cv === "function") {
            console.log("[OpenCV] Factory pattern detected, initializing...");
            _cv = await _cv();
          }

          if (_cv?.Mat) {
            clearTimeout(timeout);
            cvInstance = _cv;
            console.log("[OpenCV] Loaded and ready");
            resolve(_cv);
            return;
          }

          // WASM build: wait for runtime initialization
          if (_cv) {
            _cv.onRuntimeInitialized = () => {
              clearTimeout(timeout);
              cvInstance = _cv;
              console.log("[OpenCV] WASM initialized");
              resolve(_cv);
            };
            return;
          }

          throw new Error("OpenCV module initialization failed");
        } catch (err) {
          clearTimeout(timeout);
          loadPromise = null;
          reject(err);
        }
      };
      init();
    };

    script.onerror = () => {
      clearTimeout(timeout);
      loadPromise = null;
      reject(new Error("Failed to load OpenCV.js from CDN"));
    };

    document.head.appendChild(script);
  });
}
