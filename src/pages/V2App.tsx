import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { Upload, Camera, RotateCcw, ArrowLeft, Sparkles, Image as ImageIcon } from "lucide-react";
import { detectInWorker } from "@/lib/image-processing/worker-api";
import { applyTagVision } from "@/lib/image-processing/tag-vision";
import { analyzeCorners, type CornerScore } from "@/lib/image-processing/corner-analyzer";
import { calculateAllGrades } from "@/lib/grading/calculator";
import { marginsToRatio, outerInnerToMeasurement } from "@/lib/grading/ratio-utils";
import { CornerPanel } from "@/components/v2/CornerPanel";
import { CenteringDiagram } from "@/components/v2/CenteringDiagram";

type ViewMode = "color" | "vision";

interface Guides {
  outer: { left: number; right: number; top: number; bottom: number };
  inner: { left: number; right: number; top: number; bottom: number };
}

export default function V2App() {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [visionSrc, setVisionSrc] = useState<string | null>(null);
  const [guides, setGuides] = useState<Guides | null>(null);
  const [corners, setCorners] = useState<CornerScore[] | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("color");
  const [side, setSide] = useState<"front" | "back">("front");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const processingRef = useRef(false);

  const runAnalysis = useCallback(async (src: string) => {
    setIsAnalyzing(true);
    setVisionSrc(null);
    setGuides(null);
    setCorners(null);

    try {
      // 1. Detect edges
      setProgress("Detecting card edges...");
      const detection = await detectInWorker(src);
      const detectedGuides = { outer: detection.outer, inner: detection.inner };
      setGuides(detectedGuides);

      // 2. Apply TAG Vision filter (in parallel with corner analysis)
      setProgress("Applying TAG Vision filter...");
      const [vision, cornerScores] = await Promise.all([
        applyTagVision(src, { radius: 6, amplify: 2.4, grayscale: true }),
        analyzeCorners({ imageSrc: src, outer: detectedGuides.outer }),
      ]);

      setVisionSrc(vision);
      setCorners(cornerScores);
      setProgress("");
    } catch (err) {
      console.error("Analysis failed:", err);
      setProgress("Analysis failed — please try another image");
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/") || processingRef.current) return;
      processingRef.current = true;
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        setImageSrc(src);
        runAnalysis(src).finally(() => {
          processingRef.current = false;
        });
      };
      reader.onerror = () => { processingRef.current = false; };
      reader.readAsDataURL(file);
    },
    [runAnalysis]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    setTimeout(() => { if (e.target) e.target.value = ""; }, 500);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const reset = () => {
    setImageSrc(null);
    setVisionSrc(null);
    setGuides(null);
    setCorners(null);
    setViewMode("color");
    processingRef.current = false;
  };

  // Centering calc from guides
  const centering = guides ? calculateCentering(guides) : null;
  const ratio = guides
    ? marginsToRatio(outerInnerToMeasurement(guides.outer, guides.inner))
    : null;
  const grades = ratio ? calculateAllGrades(ratio, null) : null;
  const bestGrade = grades?.find((g) => g.bestGrade)?.bestGrade ?? null;

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" /> V1
          </Link>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-bold">Centering Tool <span className="text-emerald-400">v2</span></h1>
          </div>
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-300 border border-emerald-600/40">BETA</span>

          {imageSrc && (
            <button
              onClick={reset}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md bg-zinc-800 hover:bg-zinc-700"
            >
              <RotateCcw className="w-4 h-4" /> New scan
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {!imageSrc ? (
          <UploadZone
            isDragging={isDragging}
            setIsDragging={setIsDragging}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onCameraClick={() => cameraInputRef.current?.click()}
          />
        ) : (
          <div className="space-y-6">
            {/* Front/Back side picker */}
            <div className="flex justify-center">
              <div className="inline-flex bg-zinc-900 border border-zinc-800 rounded-lg p-1">
                {(["front", "back"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setSide(s)}
                    className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors ${
                      side === s
                        ? "bg-emerald-600 text-white"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    {s.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Card Display + Centering Diagram */}
            <CenteringDiagram
              imageSrc={viewMode === "vision" && visionSrc ? visionSrc : imageSrc}
              guides={guides}
              centering={centering}
              isAnalyzing={isAnalyzing}
              progress={progress}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              hasVision={!!visionSrc}
            />

            {/* Corner Analysis */}
            {corners && (
              <section className="space-y-4">
                <div className="text-center">
                  <div className="inline-flex flex-col items-center">
                    <div className="text-xs text-zinc-500 uppercase tracking-wide">
                      {side === "front" ? "Front Corners" : "Back Corners"}
                    </div>
                    <div className="text-2xl font-bold mt-1">
                      Total: <span className="text-emerald-400">{Math.round(corners.reduce((s, c) => s + c.total, 0) / corners.length)}</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {corners.map((c) => (
                    <CornerPanel key={c.name} corner={c} />
                  ))}
                </div>
              </section>
            )}

            {/* Grade Summary */}
            {centering && ratio && (
              <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-emerald-400" /> Centering Summary
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <SummaryStat
                    label="Left/Right"
                    value={`${centering.lr.left.toFixed(1)} / ${centering.lr.right.toFixed(1)}`}
                  />
                  <SummaryStat
                    label="Top/Bottom"
                    value={`${centering.tb.top.toFixed(1)} / ${centering.tb.bottom.toFixed(1)}`}
                  />
                  <SummaryStat
                    label="H Ratio"
                    value={`${ratio.horizontal.larger}/${ratio.horizontal.smaller}`}
                  />
                  <SummaryStat
                    label="Best Grade"
                    value={bestGrade?.grade ?? "—"}
                    highlight
                  />
                </div>

                {grades && (
                  <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {grades.map((g) => (
                      <div
                        key={g.company.id}
                        className="bg-zinc-950 rounded-lg border border-zinc-800 p-3 text-center"
                      >
                        <div className="text-xs text-zinc-500 mb-1">{g.company.name}</div>
                        <div className="text-lg font-bold text-emerald-400">
                          {g.bestGrade?.grade ?? "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </main>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}

function UploadZone({
  isDragging, setIsDragging, onDrop, onClick, onCameraClick,
}: {
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  onDrop: (e: React.DragEvent) => void;
  onClick: () => void;
  onCameraClick: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto pt-12">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold mb-3">
          Pro-Grade Card Analysis
        </h2>
        <p className="text-zinc-400">
          Upload a card to get TAG-style centering, corner analysis, and surface defect detection.
        </p>
      </div>

      <div
        className={`relative border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${
          isDragging
            ? "border-emerald-500 bg-emerald-500/10 scale-[1.02]"
            : "border-zinc-700 hover:border-emerald-500/50 hover:bg-zinc-900"
        }`}
        onClick={onClick}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
      >
        <Upload className="w-12 h-12 text-zinc-500 mx-auto mb-4" />
        <p className="text-lg font-medium mb-2">
          Drop your card image here or click to upload
        </p>
        <p className="text-sm text-zinc-500 mb-6">
          Supports JPG, PNG, WEBP — best with high-res scans
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onCameraClick(); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium border border-zinc-700"
        >
          <Camera className="w-4 h-4" /> Use Camera
        </button>
      </div>

      <div className="mt-8 grid grid-cols-3 gap-4 text-center">
        <Feature title="TAG Vision" desc="High-pass filter reveals scratches, dents, and surface wear" />
        <Feature title="Corner Analysis" desc="Per-corner scoring for fray, fill, sharpness, and angle" />
        <Feature title="Centering" desc="Precise sub-pixel edge detection on toploader-friendly photos" />
      </div>
    </div>
  );
}

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800">
      <div className="text-sm font-semibold text-emerald-400 mb-1">{title}</div>
      <div className="text-xs text-zinc-500">{desc}</div>
    </div>
  );
}

function SummaryStat({ label, value, highlight = false }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="bg-zinc-950 rounded-lg border border-zinc-800 p-4">
      <div className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</div>
      <div className={`text-xl font-bold ${highlight ? "text-emerald-400" : "text-white"}`}>{value}</div>
    </div>
  );
}

function calculateCentering(guides: Guides) {
  // Outer border widths (in % of image)
  const W = guides.outer.right - guides.outer.left;
  const H = guides.outer.bottom - guides.outer.top;
  const innerLeftBorder = guides.inner.left - guides.outer.left;
  const innerRightBorder = guides.outer.right - guides.inner.right;
  const innerTopBorder = guides.inner.top - guides.outer.top;
  const innerBottomBorder = guides.outer.bottom - guides.inner.bottom;

  const lrTotal = innerLeftBorder + innerRightBorder;
  const tbTotal = innerTopBorder + innerBottomBorder;

  return {
    lr: {
      left: (innerLeftBorder / lrTotal) * 100,
      right: (innerRightBorder / lrTotal) * 100,
    },
    tb: {
      top: (innerTopBorder / tbTotal) * 100,
      bottom: (innerBottomBorder / tbTotal) * 100,
    },
    cardW: W,
    cardH: H,
  };
}
