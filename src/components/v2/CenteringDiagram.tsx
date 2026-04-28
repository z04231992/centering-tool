import type React from "react";
import { Loader2, Eye, Sparkles } from "lucide-react";

interface Guides {
  outer: { left: number; right: number; top: number; bottom: number };
  inner: { left: number; right: number; top: number; bottom: number };
}

interface Centering {
  lr: { left: number; right: number };
  tb: { top: number; bottom: number };
  cardW: number;
  cardH: number;
}

interface Props {
  imageSrc: string;
  guides: Guides | null;
  centering: Centering | null;
  isAnalyzing: boolean;
  progress: string;
  viewMode: "color" | "vision";
  onViewModeChange: (mode: "color" | "vision") => void;
  hasVision: boolean;
}

export function CenteringDiagram({
  imageSrc,
  guides,
  centering,
  isAnalyzing,
  progress,
  viewMode,
  onViewModeChange,
  hasVision,
}: Props) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* TAG-style measurement layout: card centered with C: values around it */}
      <div className="grid grid-cols-[60px_1fr_60px] grid-rows-[40px_1fr_40px] max-w-3xl mx-auto p-4 lg:p-8">

        {/* Top center — top centering value */}
        <div className="col-start-2 row-start-1 flex items-end justify-center pb-2">
          {centering && (
            <div className="text-xs font-mono text-zinc-400">
              C: <span className="text-zinc-100 font-bold">{centering.tb.top.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Left side — left centering value */}
        <div className="col-start-1 row-start-2 flex items-center justify-end pr-2">
          {centering && (
            <div className="text-xs font-mono text-zinc-400 [writing-mode:vertical-rl] rotate-180">
              C: <span className="text-zinc-100 font-bold">{centering.lr.left.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Card image area */}
        <div className="col-start-2 row-start-2 relative bg-zinc-950 rounded-lg overflow-hidden">
          <img
            src={imageSrc}
            alt="Card"
            className="block w-full h-auto"
            draggable={false}
          />

          {/* Guides overlay */}
          {guides && !isAnalyzing && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* Outer card edge — solid white */}
              <rect
                x={guides.outer.left}
                y={guides.outer.top}
                width={guides.outer.right - guides.outer.left}
                height={guides.outer.bottom - guides.outer.top}
                fill="none"
                stroke="white"
                strokeWidth="0.3"
              />
              {/* Inner border edge — dashed cyan */}
              <rect
                x={guides.inner.left}
                y={guides.inner.top}
                width={guides.inner.right - guides.inner.left}
                height={guides.inner.bottom - guides.inner.top}
                fill="none"
                stroke="rgb(34 211 238)"
                strokeWidth="0.25"
                strokeDasharray="0.8 0.8"
              />
              {/* Corner brackets — TAG style */}
              {renderCornerBrackets(guides.outer)}
              {/* Diagonal lines through center */}
              <line
                x1={guides.outer.left}
                y1={guides.outer.top}
                x2={guides.outer.right}
                y2={guides.outer.bottom}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="0.15"
                strokeDasharray="0.5 0.5"
              />
              <line
                x1={guides.outer.right}
                y1={guides.outer.top}
                x2={guides.outer.left}
                y2={guides.outer.bottom}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="0.15"
                strokeDasharray="0.5 0.5"
              />
              {/* Crosshair */}
              <line
                x1={(guides.outer.left + guides.outer.right) / 2}
                y1={guides.outer.top}
                x2={(guides.outer.left + guides.outer.right) / 2}
                y2={guides.outer.bottom}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="0.15"
                strokeDasharray="0.5 0.5"
              />
              <line
                x1={guides.outer.left}
                y1={(guides.outer.top + guides.outer.bottom) / 2}
                x2={guides.outer.right}
                y2={(guides.outer.top + guides.outer.bottom) / 2}
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="0.15"
                strokeDasharray="0.5 0.5"
              />
            </svg>
          )}

          {/* Loading overlay */}
          {isAnalyzing && (
            <div className="absolute inset-0 bg-zinc-950/70 backdrop-blur-sm flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mb-3" />
              <p className="text-sm text-zinc-300">{progress || "Analyzing..."}</p>
            </div>
          )}

          {/* View mode toggle (overlay on card) */}
          {hasVision && !isAnalyzing && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 flex gap-2 bg-zinc-950/90 backdrop-blur rounded-full p-1 border border-zinc-700">
              <button
                onClick={() => onViewModeChange("color")}
                className={`px-3 py-1 text-xs rounded-full font-medium flex items-center gap-1.5 transition-colors ${
                  viewMode === "color"
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Eye className="w-3 h-3" />
                Full Color
              </button>
              <button
                onClick={() => onViewModeChange("vision")}
                className={`px-3 py-1 text-xs rounded-full font-medium flex items-center gap-1.5 transition-colors ${
                  viewMode === "vision"
                    ? "bg-emerald-500 text-zinc-900"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                <Sparkles className="w-3 h-3" />
                TAG Vision
              </button>
            </div>
          )}
        </div>

        {/* Right side — right centering value */}
        <div className="col-start-3 row-start-2 flex items-center justify-start pl-2">
          {centering && (
            <div className="text-xs font-mono text-zinc-400 [writing-mode:vertical-rl]">
              C: <span className="text-zinc-100 font-bold">{centering.lr.right.toFixed(2)}</span>
            </div>
          )}
        </div>

        {/* Bottom center — bottom centering value */}
        <div className="col-start-2 row-start-3 flex items-start justify-center pt-2">
          {centering && (
            <div className="text-xs font-mono text-zinc-400">
              C: <span className="text-zinc-100 font-bold">{centering.tb.bottom.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderCornerBrackets(outer: Guides["outer"]) {
  const brackets: React.ReactElement[] = [];
  const len = 4; // bracket arm length in % units
  const w = 0.4;
  const corners = [
    { x: outer.left, y: outer.top, dx: 1, dy: 1, k: "tl" },
    { x: outer.right, y: outer.top, dx: -1, dy: 1, k: "tr" },
    { x: outer.left, y: outer.bottom, dx: 1, dy: -1, k: "bl" },
    { x: outer.right, y: outer.bottom, dx: -1, dy: -1, k: "br" },
  ];
  for (const c of corners) {
    brackets.push(
      <line
        key={c.k + "h"}
        x1={c.x}
        y1={c.y}
        x2={c.x + c.dx * len}
        y2={c.y}
        stroke="white"
        strokeWidth={w}
      />,
      <line
        key={c.k + "v"}
        x1={c.x}
        y1={c.y}
        x2={c.x}
        y2={c.y + c.dy * len}
        stroke="white"
        strokeWidth={w}
      />
    );
  }
  return brackets;
}
