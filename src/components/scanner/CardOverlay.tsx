import { useCallback, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";

interface CardOverlayProps {
  outer: { left: number; top: number; right: number; bottom: number };
  inner: { left: number; top: number; right: number; bottom: number };
  onOuterChange: (edge: "left" | "right" | "top" | "bottom", value: number) => void;
  onInnerChange: (edge: "left" | "right" | "top" | "bottom", value: number) => void;
}

type DragTarget = { layer: "outer" | "inner"; edge: "left" | "right" | "top" | "bottom" };

export function CardOverlay({ outer, inner, onOuterChange, onInnerChange }: CardOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const { outerGuideColor, innerGuideColor } = useSettingsStore();

  const handlePointerDown = useCallback((target: DragTarget, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragTarget(target);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragTarget || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const isHorizontal = dragTarget.edge === "left" || dragTarget.edge === "right";
    const pos = isHorizontal
      ? ((e.clientX - rect.left) / rect.width) * 100
      : ((e.clientY - rect.top) / rect.height) * 100;
    const clamped = Math.max(0, Math.min(100, pos));

    if (dragTarget.layer === "outer") {
      onOuterChange(dragTarget.edge, clamped);
    } else {
      onInnerChange(dragTarget.edge, clamped);
    }
  }, [dragTarget, onOuterChange, onInnerChange]);

  const handlePointerUp = useCallback(() => {
    setDragTarget(null);
  }, []);

  const patternId = "hatch-pattern";

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ touchAction: "none" }}
    >
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
        <defs>
          <pattern id={patternId} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="8" stroke={outerGuideColor} strokeWidth="3" opacity="0.3" />
          </pattern>
        </defs>

        {/* Hatched area between outer and inner (the border zone) */}
        <rect
          x={`${outer.left}%`} y={`${outer.top}%`}
          width={`${Math.max(0, outer.right - outer.left)}%`} height={`${Math.max(0, inner.top - outer.top)}%`}
          fill={`url(#${patternId})`}
        />
        <rect
          x={`${outer.left}%`} y={`${inner.bottom}%`}
          width={`${Math.max(0, outer.right - outer.left)}%`} height={`${Math.max(0, outer.bottom - inner.bottom)}%`}
          fill={`url(#${patternId})`}
        />
        <rect
          x={`${outer.left}%`} y={`${inner.top}%`}
          width={`${Math.max(0, inner.left - outer.left)}%`} height={`${Math.max(0, inner.bottom - inner.top)}%`}
          fill={`url(#${patternId})`}
        />
        <rect
          x={`${inner.right}%`} y={`${inner.top}%`}
          width={`${Math.max(0, outer.right - inner.right)}%`} height={`${Math.max(0, inner.bottom - inner.top)}%`}
          fill={`url(#${patternId})`}
        />

        {/* Outer border line - dotted */}
        <rect
          x={`${outer.left}%`} y={`${outer.top}%`}
          width={`${outer.right - outer.left}%`} height={`${outer.bottom - outer.top}%`}
          fill="none" stroke={outerGuideColor} strokeWidth={2} strokeDasharray="4 3"
        />

        {/* Inner area - dark fill + border */}
        <rect
          x={`${inner.left}%`} y={`${inner.top}%`}
          width={`${inner.right - inner.left}%`} height={`${inner.bottom - inner.top}%`}
          fill="rgba(0,0,0,0.35)" stroke={innerGuideColor} strokeWidth={1.5} strokeDasharray="4 3" opacity={0.9}
        />
      </svg>

      {/* Arrow handles for OUTER edges */}
      <ArrowHandle edge="left" pos={outer.left} midPerp={(outer.top + outer.bottom) / 2}
        direction="horizontal" color={outerGuideColor} icon={<ChevronLeft className="w-4 h-4" />}
        onPointerDown={(e) => handlePointerDown({ layer: "outer", edge: "left" }, e)} />
      <ArrowHandle edge="right" pos={outer.right} midPerp={(outer.top + outer.bottom) / 2}
        direction="horizontal" color={outerGuideColor} icon={<ChevronRight className="w-4 h-4" />}
        onPointerDown={(e) => handlePointerDown({ layer: "outer", edge: "right" }, e)} />
      <ArrowHandle edge="top" pos={outer.top} midPerp={(outer.left + outer.right) / 2}
        direction="vertical" color={outerGuideColor} icon={<ChevronUp className="w-4 h-4" />}
        onPointerDown={(e) => handlePointerDown({ layer: "outer", edge: "top" }, e)} />
      <ArrowHandle edge="bottom" pos={outer.bottom} midPerp={(outer.left + outer.right) / 2}
        direction="vertical" color={outerGuideColor} icon={<ChevronDown className="w-4 h-4" />}
        onPointerDown={(e) => handlePointerDown({ layer: "outer", edge: "bottom" }, e)} />

      {/* Arrow handles for INNER edges */}
      <ArrowHandle edge="left" pos={inner.left} midPerp={(inner.top + inner.bottom) / 2}
        direction="horizontal" color={innerGuideColor} icon={<ChevronLeft className="w-3.5 h-3.5" />}
        onPointerDown={(e) => handlePointerDown({ layer: "inner", edge: "left" }, e)} small />
      <ArrowHandle edge="right" pos={inner.right} midPerp={(inner.top + inner.bottom) / 2}
        direction="horizontal" color={innerGuideColor} icon={<ChevronRight className="w-3.5 h-3.5" />}
        onPointerDown={(e) => handlePointerDown({ layer: "inner", edge: "right" }, e)} small />
      <ArrowHandle edge="top" pos={inner.top} midPerp={(inner.left + inner.right) / 2}
        direction="vertical" color={innerGuideColor} icon={<ChevronUp className="w-3.5 h-3.5" />}
        onPointerDown={(e) => handlePointerDown({ layer: "inner", edge: "top" }, e)} small />
      <ArrowHandle edge="bottom" pos={inner.bottom} midPerp={(inner.left + inner.right) / 2}
        direction="vertical" color={innerGuideColor} icon={<ChevronDown className="w-3.5 h-3.5" />}
        onPointerDown={(e) => handlePointerDown({ layer: "inner", edge: "bottom" }, e)} small />
    </div>
  );
}

function ArrowHandle({ pos, midPerp, direction, color, icon, onPointerDown, small }: {
  edge: string;
  pos: number;
  midPerp: number;
  direction: "horizontal" | "vertical";
  color: string;
  icon: React.ReactNode;
  onPointerDown: (e: React.PointerEvent) => void;
  small?: boolean;
}) {
  const size = small ? 28 : 34;

  const style: React.CSSProperties = direction === "horizontal"
    ? { left: `${pos}%`, top: `${midPerp}%`, transform: "translate(-50%, -50%)", cursor: "ew-resize" }
    : { left: `${midPerp}%`, top: `${pos}%`, transform: "translate(-50%, -50%)", cursor: "ns-resize" };

  return (
    <div
      className="absolute z-10 flex items-center justify-center rounded-md shadow-lg"
      style={{
        ...style,
        width: size,
        height: size,
        backgroundColor: color,
        color: "#fff",
        opacity: 0.9,
      }}
      onPointerDown={onPointerDown}
    >
      {icon}
    </div>
  );
}
