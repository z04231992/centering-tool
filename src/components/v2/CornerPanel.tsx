import type { CornerScore } from "@/lib/image-processing/corner-analyzer";

const CORNER_LABELS: Record<CornerScore["name"], string> = {
  tl: "TOP LEFT",
  tr: "TOP RIGHT",
  bl: "BOTTOM LEFT",
  br: "BOTTOM RIGHT",
};

export function CornerPanel({ corner }: { corner: CornerScore }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="relative aspect-square bg-zinc-950">
        <img
          src={corner.cropDataUrl}
          alt={CORNER_LABELS[corner.name]}
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Defect annotations */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {corner.defects.map((d, i) => (
            <g key={i}>
              <circle
                cx={d.x}
                cy={d.y}
                r="3"
                fill="none"
                stroke="rgb(34 211 238 / 0.9)"
                strokeWidth="0.5"
              />
              <text
                x={d.x + 4}
                y={d.y - 1}
                fill="rgb(34 211 238)"
                fontSize="3"
                fontWeight="bold"
              >
                {d.severity}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="p-3 border-t border-zinc-800">
        <div className="text-[10px] font-bold text-zinc-400 tracking-wider mb-2">
          {CORNER_LABELS[corner.name]}
        </div>
        <div className="space-y-1 text-xs">
          <ScoreRow label="Total" value={corner.total} primary />
          <ScoreRow label="Fray" value={corner.fray} />
          <ScoreRow label="Fill" value={corner.fill} />
          <ScoreRow label="CSW" value={corner.csw} />
          <ScoreRow label="Angle" value={`${corner.angle.toFixed(2)}°`} />
        </div>
      </div>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: number | string;
  primary?: boolean;
}) {
  const colorClass =
    typeof value === "number"
      ? value >= 950
        ? "text-emerald-400"
        : value >= 900
          ? "text-yellow-400"
          : "text-orange-400"
      : "text-zinc-300";
  return (
    <div className="flex items-center justify-between">
      <span className={`text-zinc-500 ${primary ? "font-semibold" : ""}`}>
        {label}:
      </span>
      <span className={`font-mono ${primary ? "font-bold text-base" : ""} ${colorClass}`}>
        {value}
      </span>
    </div>
  );
}
