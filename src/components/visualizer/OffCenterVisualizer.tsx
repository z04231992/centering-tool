import { useState } from "react";
import { GRADING_COMPANIES } from "@/lib/grading/standards";

export function OffCenterVisualizer() {
  const [horizontalRatio, setHorizontalRatio] = useState(50);
  const [verticalRatio, setVerticalRatio] = useState(50);
  const [selectedCompany, setSelectedCompany] = useState("psa");

  const company = GRADING_COMPANIES.find((c) => c.id === selectedCompany)!;

  const largerH = Math.max(horizontalRatio, 100 - horizontalRatio);
  const largerV = Math.max(verticalRatio, 100 - verticalRatio);
  const worstAxis = Math.max(largerH, largerV);

  const matchingGrade = company.grades.find(
    (g) => worstAxis <= g.front.maxLargerSide
  );

  // Card dimensions (standard 2.5:3.5 ratio)
  const cardW = 250;
  const cardH = 350;
  const borderSize = 30;

  // Inner content position based on ratio
  const contentW = cardW - borderSize * 2;
  const contentH = cardH - borderSize * 2;
  const offsetX = ((horizontalRatio - 50) / 50) * borderSize;
  const offsetY = ((verticalRatio - 50) / 50) * borderSize;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Off-Center Visualization</h2>
        <p className="text-muted-foreground">
          Adjust the sliders to see what different centering ratios look like on a card.
          This helps you quickly assess centering without scanning.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Card Preview */}
        <div className="flex justify-center">
          <svg
            width={cardW}
            height={cardH}
            viewBox={`0 0 ${cardW} ${cardH}`}
            className="rounded-xl overflow-hidden drop-shadow-xl"
          >
            {/* Card border */}
            <rect width={cardW} height={cardH} rx={12} fill="#e5e5e5" className="dark:fill-neutral-700" />

            {/* Content area */}
            <rect
              x={borderSize + offsetX}
              y={borderSize + offsetY}
              width={contentW}
              height={contentH}
              rx={4}
              className="fill-white dark:fill-neutral-800"
            />

            {/* Left margin indicator */}
            <line x1={0} y1={cardH / 2} x2={borderSize + offsetX} y2={cardH / 2} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" />
            {/* Right margin indicator */}
            <line x1={borderSize + offsetX + contentW} y1={cardH / 2} x2={cardW} y2={cardH / 2} stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 2" />
            {/* Top margin indicator */}
            <line x1={cardW / 2} y1={0} x2={cardW / 2} y2={borderSize + offsetY} stroke="#ef4444" strokeWidth={2} strokeDasharray="4 2" />
            {/* Bottom margin indicator */}
            <line x1={cardW / 2} y1={borderSize + offsetY + contentH} x2={cardW / 2} y2={cardH} stroke="#3b82f6" strokeWidth={2} strokeDasharray="4 2" />

            {/* Center crosshair */}
            <circle cx={cardW / 2} cy={cardH / 2} r={3} fill="none" stroke="#8b5cf6" strokeWidth={1} opacity={0.5} />

            {/* Labels */}
            <text x={(borderSize + offsetX) / 2} y={cardH / 2 - 8} textAnchor="middle" fontSize={11} fill="#ef4444" fontWeight="bold">
              {horizontalRatio}
            </text>
            <text x={borderSize + offsetX + contentW + (cardW - borderSize - offsetX - contentW) / 2} y={cardH / 2 - 8} textAnchor="middle" fontSize={11} fill="#3b82f6" fontWeight="bold">
              {100 - horizontalRatio}
            </text>
          </svg>
        </div>

        {/* Controls */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium mb-2">
              Horizontal: {horizontalRatio}/{100 - horizontalRatio}
            </label>
            <input
              type="range"
              min={30}
              max={70}
              value={horizontalRatio}
              onChange={(e) => setHorizontalRatio(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>30/70</span>
              <span>50/50</span>
              <span>70/30</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Vertical: {verticalRatio}/{100 - verticalRatio}
            </label>
            <input
              type="range"
              min={30}
              max={70}
              value={verticalRatio}
              onChange={(e) => setVerticalRatio(Number(e.target.value))}
              className="w-full accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>30/70</span>
              <span>50/50</span>
              <span>70/30</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Grading Company</label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-foreground"
            >
              {GRADING_COMPANIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - {c.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* Grade result */}
          <div className="border border-border rounded-xl p-4 bg-card">
            <p className="text-sm text-muted-foreground mb-1">
              {company.name} Centering Grade (Front)
            </p>
            {matchingGrade ? (
              <div>
                <span
                  className="text-3xl font-bold"
                  style={{ color: company.color }}
                >
                  {matchingGrade.numericGrade}
                </span>
                <p className="text-sm text-muted-foreground mt-1">{matchingGrade.grade}</p>
              </div>
            ) : (
              <div>
                <span className="text-3xl font-bold text-muted-foreground">--</span>
                <p className="text-sm text-destructive mt-1">Below minimum threshold</p>
              </div>
            )}
          </div>

          {/* Quick presets */}
          <div>
            <p className="text-sm font-medium mb-2">Quick Presets</p>
            <div className="flex flex-wrap gap-2">
              {[
                [50, 50],
                [55, 45],
                [60, 40],
                [65, 35],
                [70, 30],
              ].map(([l, r]) => (
                <button
                  key={`${l}/${r}`}
                  onClick={() => {
                    setHorizontalRatio(l);
                    setVerticalRatio(l);
                  }}
                  className="px-3 py-1.5 text-sm rounded-lg bg-secondary hover:bg-secondary/80 transition-colors"
                >
                  {l}/{r}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
