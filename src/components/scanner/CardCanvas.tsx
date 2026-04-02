import { useMeasurementStore } from "@/stores/measurement-store";
import { useSettingsStore } from "@/stores/settings-store";
import { ImageUploader } from "./ImageUploader";
import { CardOverlay } from "./CardOverlay";
import { Scan, Loader2, Upload, Eye, EyeOff, RotateCcw, RotateCw, Share2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { detectCardEdges, generateProcessedPreview } from "@/lib/image-processing/card-detector";
import { rotateImageSrc } from "@/lib/image-processing/rotate";
import { generateShareImage, downloadShareImage } from "@/lib/share-export";
import { useGradeCalculation } from "@/hooks/useGradeCalculation";

export function CardCanvas() {
  const { activeSide, front, back, reset, setGuide } = useMeasurementStore();
  const { outerGuideColor, innerGuideColor } = useSettingsStore();
  const side = activeSide === "front" ? front : back;
  const [detecting, setDetecting] = useState(false);
  const [showProcessed, setShowProcessed] = useState(false);
  const [processedSrc, setProcessedSrc] = useState<string | null>(null);
  const [warpEnabled, setWarpEnabled] = useState(false);
  const [warpedSrc, setWarpedSrc] = useState<string | null>(null);
  const lastAnalyzedSrc = useRef<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const rotationRef = useRef(0);
  const [sharing, setSharing] = useState(false);
  const { frontRatio, backRatio, grades, hasBack } = useGradeCalculation();

  // Auto-detect when a new image is uploaded
  useEffect(() => {
    if (side.imageSrc && side.imageSrc !== lastAnalyzedSrc.current) {
      lastAnalyzedSrc.current = side.imageSrc;
      setRotation(0);
      rotationRef.current = 0;
      setShowProcessed(false); // Always start in color mode on new image
      runDetection();
    }
  }, [side.imageSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!side.imageSrc) {
    return <ImageUploader />;
  }

  async function runDetection(warpOverride?: boolean, rotOverride?: number) {
    if (!side.imageSrc) return;

    const useWarp = warpOverride ?? warpEnabled;
    const useRotation = rotOverride ?? rotation;
    setDetecting(true);
    setWarpedSrc(null);
    setProcessedSrc(null);

    try {
      // If rotation is applied, rotate the source image first
      const srcToUse = useRotation !== 0
        ? await rotateImageSrc(side.imageSrc, useRotation)
        : side.imageSrc;

      const result = await detectCardEdges(srcToUse, { warp: useWarp });
      if (result) {
        // If warp produced a warped image, store it
        if (result.warpedImageSrc) {
          setWarpedSrc(result.warpedImageSrc);
          generateProcessedPreview(result.warpedImageSrc)
            .then(setProcessedSrc)
            .catch(() => setProcessedSrc(null));
        } else {
          // If rotated but no warp, use the rotated source
          generateProcessedPreview(srcToUse)
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
        generateProcessedPreview(srcToUse)
          .then(setProcessedSrc)
          .catch(() => setProcessedSrc(null));
      }
    } catch (err) {
      console.error("[Detection]", err);
    } finally {
      setDetecting(false);
    }
  }

  const handleRotationSlide = (newRotation: number) => {
    // Only update visual rotation — user clicks Re-Detect to apply
    setRotation(newRotation);
    rotationRef.current = newRotation;
  };

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

  const handleShare = async () => {
    if (!side.imageSrc) return;
    setSharing(true);
    try {
      const dataUrl = await generateShareImage({
        imageSrc: getDisplaySrc(),
        outer: side.outer,
        inner: side.inner,
        outerColor: outerGuideColor,
        innerColor: innerGuideColor,
        frontRatio,
        backRatio,
        grades,
        hasBack,
      });
      downloadShareImage(dataUrl);
    } catch (err) {
      console.error("[Share]", err);
    } finally {
      setSharing(false);
    }
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

      {/* Warp toggle + Rotation slider */}
      <div className="flex flex-col items-center gap-3">
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

        {/* Rotation adjustment */}
        <div className="flex items-center gap-3 w-full max-w-xs">
          <RotateCw className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <div className="flex flex-col w-full gap-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Rotation</span>
              <span className="text-xs font-mono text-muted-foreground">{rotation.toFixed(1)}°</span>
            </div>
            <input
              type="range"
              min={-45}
              max={45}
              step={0.1}
              value={rotation}
              onChange={(e) => handleRotationSlide(parseFloat(e.target.value))}
              className="w-full h-1.5 accent-primary cursor-pointer"
            />
          </div>
          {rotation !== 0 && (
            <button
              onClick={() => { setRotation(0); rotationRef.current = 0; runDetection(undefined, 0); }}
              className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded bg-secondary flex-shrink-0"
            >
              Reset
            </button>
          )}
        </div>
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
          onClick={() => { reset(); setProcessedSrc(null); setWarpedSrc(null); setShowProcessed(true); setRotation(0); rotationRef.current = 0; lastAnalyzedSrc.current = null; }}
          className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-full bg-secondary hover:bg-secondary/80 border border-border transition-all"
        >
          <Upload className="w-4 h-4" />
          New Photo
        </button>
        <button
          onClick={handleShare}
          disabled={sharing || !side.imageSrc}
          className="flex items-center gap-2 px-4 py-2.5 text-sm rounded-full bg-green-600 hover:bg-green-700 text-white transition-all disabled:opacity-50"
        >
          {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
          {sharing ? "Exporting..." : "Share"}
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
            style={rotation !== 0 ? { transform: `rotate(${rotation}deg)`, transformOrigin: "center center" } : undefined}
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
