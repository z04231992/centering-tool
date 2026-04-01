import { useMeasurementStore } from "@/stores/measurement-store";
import { useSettingsStore } from "@/stores/settings-store";
import { ImageUploader } from "./ImageUploader";
import { CardOverlay } from "./CardOverlay";
import { Scan, Loader2, Upload, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { detectCardEdges, generateProcessedPreview } from "@/lib/image-processing/card-detector";

export function CardCanvas() {
  const { activeSide, front, back, reset, setGuide } = useMeasurementStore();
  const { outerGuideColor, innerGuideColor } = useSettingsStore();
  const side = activeSide === "front" ? front : back;
  const [detecting, setDetecting] = useState(false);
  const [showProcessed, setShowProcessed] = useState(true);
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const [warpEnabled, setWarpEnabled] = useState(true);
  const [warpedSrc, setWarpedSrc] = useState<string | null>(null);
  const lastAnalyzedSrc = useRef<string | null>(null);

  // Auto-detect when a new image is uploaded
  useEffect(() => {
    if (side.imageSrc && side.imageSrc !== lastAnalyzedSrc.current) {
      lastAnalyzedSrc.current = side.imageSrc;
      runDetection();
    }
  }, [side.imageSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!side.imageSrc) {
    return <ImageUploader />;
  }

  async function runDetection(warpOverride?: boolean) {
    if (!side.imageSrc) return;

    const useWarp = warpOverride ?? warpEnabled;
    setDetecting(true);
    setWarpedSrc(null);
    setProcessedSrc(null);

    try {
      const result = await detectCardEdges(side.imageSrc, { warp: useWarp });
      if (result) {
        // If warp produced a warped image, store it
        if (result.warpedImageSrc) {
          setWarpedSrc(result.warpedImageSrc);
          generateProcessedPreview(result.warpedImageSrc)
            .then(setProcessedSrc)
            .catch(() => setProcessedSrc(null));
        } else {
          generateProcessedPreview(side.imageSrc)
            .then(setProcessedSrc)
            .catch(() => setProcessedSrc(null));
        }

        setGuide(activeSide, "outer", "left", result.outer.left);
        setGuide(activeSide, "outer", "right", result.outer.right);
        setGuide(activeSide, "outer", "top", result.outer.top);
        setGuide(activeSide, "outer", "bottom", result.outer.bottom);
        setGuide(activeSide, "inner", "left", result.inner.left);
        setGuide(activeSide, "inner", "right", result.inner.right);
        setGuide(activeSide, "inner", "top", result.inner.top);
        setGuide(activeSide, "inner", "bottom", result.inner.bottom);
      } else {
        // Still generate B&W preview even if detection fails
        generateProcessedPreview(side.imageSrc)
          .then(setProcessedSrc)
          .catch(() => setProcessedSrc(null));
      }
    } catch (err) {
      console.error("[Detection]", err);
    } finally {
      setDetecting(false);
    }
  }

  const handleOuterChange = (edge: "left" | "right" | "top" | "bottom", value: number) => {
    setGuide(activeSide, "outer", edge, value);
  };
  const handleInnerChange = (edge: "left" | "right" | "top" | "bottom", value: number) => {
    setGuide(activeSide, "inner", edge, value);
  };

  // Determine which image source to show
  const getDisplaySrc = (): string => {
    if (showProcessed && processedSrc) return processedSrc;
    if (warpedSrc) return warpedSrc;
    return side.imageSrc!;
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Loading state */}
      {detecting && (
        <div className="flex items-center justify-center gap-3 px-4 py-3 rounded-2xl bg-primary/10 border border-primary/20">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-sm text-primary font-medium">
            {warpEnabled ? "Warping & detecting..." : "Detecting card edges..."}
          </span>
        </div>
      )}

      {/* Warp toggle */}
      <div className="flex items-center justify-center gap-3">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={warpEnabled}
            onChange={(e) => { const v = e.target.checked; setWarpEnabled(v); runDetection(v); }}
            className="w-4 h-4 accent-primary rounded"
          />
          <span className="text-sm text-muted-foreground">
            <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
            Warp card for better accuracy
          </span>
        </label>
      </div>

      {/* Action Buttons — above the card */}
      <div className="flex gap-2 justify-center flex-wrap">
        <button
          onClick={() => runDetection()}
          disabled={detecting}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50"
        >
          {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scan className="w-4 h-4" />}
          {detecting ? "Detecting..." : "Re-Detect"}
        </button>
        <button
          onClick={() => setShowProcessed(!showProcessed)}
          disabled={!processedSrc}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-full transition-all disabled:opacity-50 ${
            showProcessed
              ? "bg-primary/20 text-primary border border-primary/30"
              : "bg-secondary hover:bg-secondary/80"
          }`}
        >
          {showProcessed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          {showProcessed ? "Original" : "B&W View"}
        </button>
        <button
          onClick={() => { reset(); setProcessedSrc(null); setWarpedSrc(null); setShowProcessed(true); lastAnalyzedSrc.current = null; }}
          className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-full bg-secondary hover:bg-secondary/80 border border-border transition-all"
        >
          <Upload className="w-4 h-4" />
          New Photo
        </button>
      </div>

      {/*
        Card Image with Overlay — fills available width, no restrictive max-height.
        The inline-block shrink-wraps to exact image dimensions so overlay aligns 1:1.
      */}
      <div className="flex justify-center w-full">
        <div className="relative inline-block rounded-xl overflow-hidden bg-black w-full">
          <img
            src={getDisplaySrc()}
            alt={`Card ${activeSide}`}
            className="block w-full select-none"
            draggable={false}
          />
          <CardOverlay
            outer={side.outer}
            inner={side.inner}
            onOuterChange={handleOuterChange}
            onInnerChange={handleInnerChange}
          />
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 justify-center text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: outerGuideColor }} /> Card edge
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: innerGuideColor }} /> Inner border
        </span>
        <span className="text-muted-foreground/50">Drag handles to adjust</span>
      </div>
    </div>
  );
}
