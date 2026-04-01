import { useCallback, useRef, useState, useEffect } from "react";
import { useMeasurementStore, type GuidePositions, type GuideLayer } from "@/stores/measurement-store";
import { ZoomLens } from "./ZoomLens";

type GuideKey = keyof GuidePositions;

interface FullGuideKey {
  layer: GuideLayer;
  key: GuideKey;
}

interface DragState {
  guide: FullGuideKey;
  startPos: number;
  startValue: number;
}

const OUTER_COLOR = "#ef4444"; // red
const INNER_COLOR = "#3b82f6"; // blue

export function MeasurementGuides() {
  const { activeSide, front, back, setGuide } = useMeasurementStore();
  const side = activeSide === "front" ? front : back;
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [hoveredGuide, setHoveredGuide] = useState<string | null>(null);
  const [focusedGuide, setFocusedGuide] = useState<FullGuideKey | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const getContainerRect = useCallback(() => {
    return containerRef.current?.getBoundingClientRect() ?? null;
  }, []);

  const handlePointerDown = useCallback(
    (guide: FullGuideKey, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      const rect = getContainerRect();
      if (!rect) return;
      const isVerticalLine = guide.key === "left" || guide.key === "right";
      const pos = isVerticalLine ? e.clientX - rect.left : e.clientY - rect.top;
      setDragState({ guide, startPos: pos, startValue: side[guide.layer][guide.key] });
    },
    [getContainerRect, side]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const rect = getContainerRect();
      if (rect) {
        setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
      if (!dragState || !rect) return;
      const isVerticalLine = dragState.guide.key === "left" || dragState.guide.key === "right";
      const currentPos = isVerticalLine ? e.clientX - rect.left : e.clientY - rect.top;
      const totalSize = isVerticalLine ? rect.width : rect.height;
      const deltaPercent = ((currentPos - dragState.startPos) / totalSize) * 100;
      let newValue = dragState.startValue + deltaPercent;
      newValue = Math.max(0, Math.min(100, newValue));

      const { layer, key } = dragState.guide;
      const outer = side.outer;
      const inner = side.inner;

      // Constraints: inner lines must stay inside outer lines
      if (layer === "outer") {
        if (key === "left") newValue = Math.min(newValue, inner.left - 1);
        if (key === "right") newValue = Math.max(newValue, inner.right + 1);
        if (key === "top") newValue = Math.min(newValue, inner.top - 1);
        if (key === "bottom") newValue = Math.max(newValue, inner.bottom + 1);
      } else {
        if (key === "left") newValue = Math.max(newValue, outer.left + 1);
        if (key === "right") newValue = Math.min(newValue, outer.right - 1);
        if (key === "top") newValue = Math.max(newValue, outer.top + 1);
        if (key === "bottom") newValue = Math.min(newValue, outer.bottom - 1);
      }

      // Also prevent left > right, top > bottom within same layer
      const sameLayer = side[layer];
      if (key === "left") newValue = Math.min(newValue, sameLayer.right - 1);
      if (key === "right") newValue = Math.max(newValue, sameLayer.left + 1);
      if (key === "top") newValue = Math.min(newValue, sameLayer.bottom - 1);
      if (key === "bottom") newValue = Math.max(newValue, sameLayer.top + 1);

      setGuide(activeSide, layer, key, newValue);
    },
    [dragState, getContainerRect, side, setGuide, activeSide]
  );

  const handlePointerUp = useCallback(() => {
    setDragState(null);
  }, []);

  useEffect(() => {
    if (!focusedGuide) return;
    const handler = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 2 : 0.2;
      let delta = 0;
      const isVerticalLine = focusedGuide.key === "left" || focusedGuide.key === "right";
      if (isVerticalLine && e.key === "ArrowLeft") delta = -step;
      if (isVerticalLine && e.key === "ArrowRight") delta = step;
      if (!isVerticalLine && e.key === "ArrowUp") delta = -step;
      if (!isVerticalLine && e.key === "ArrowDown") delta = step;
      if (delta !== 0) {
        e.preventDefault();
        const current = side[focusedGuide.layer][focusedGuide.key];
        setGuide(activeSide, focusedGuide.layer, focusedGuide.key, Math.max(0, Math.min(100, current + delta)));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusedGuide, side, setGuide, activeSide]);

  if (!side.imageSrc) return null;

  const allGuides: { layer: GuideLayer; key: GuideKey; isVerticalLine: boolean; color: string; label: string }[] = [
    // Outer (red) - card edges
    { layer: "outer", key: "left", isVerticalLine: true, color: OUTER_COLOR, label: "Edge L" },
    { layer: "outer", key: "right", isVerticalLine: true, color: OUTER_COLOR, label: "Edge R" },
    { layer: "outer", key: "top", isVerticalLine: false, color: OUTER_COLOR, label: "Edge T" },
    { layer: "outer", key: "bottom", isVerticalLine: false, color: OUTER_COLOR, label: "Edge B" },
    // Inner (blue) - border/artwork boundary
    { layer: "inner", key: "left", isVerticalLine: true, color: INNER_COLOR, label: "Border L" },
    { layer: "inner", key: "right", isVerticalLine: true, color: INNER_COLOR, label: "Border R" },
    { layer: "inner", key: "top", isVerticalLine: false, color: INNER_COLOR, label: "Border T" },
    { layer: "inner", key: "bottom", isVerticalLine: false, color: INNER_COLOR, label: "Border B" },
  ];

  const guideId = (layer: GuideLayer, key: GuideKey) => `${layer}-${key}`;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ touchAction: "none" }}
    >
      {/* SVG for margin shading between outer and inner */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
        {/* Left margin fill */}
        <rect
          x={`${side.outer.left}%`}
          y={`${side.outer.top}%`}
          width={`${Math.max(0, side.inner.left - side.outer.left)}%`}
          height={`${side.outer.bottom - side.outer.top}%`}
          fill={OUTER_COLOR}
          fillOpacity={0.08}
        />
        {/* Right margin fill */}
        <rect
          x={`${side.inner.right}%`}
          y={`${side.outer.top}%`}
          width={`${Math.max(0, side.outer.right - side.inner.right)}%`}
          height={`${side.outer.bottom - side.outer.top}%`}
          fill={OUTER_COLOR}
          fillOpacity={0.08}
        />
        {/* Top margin fill */}
        <rect
          x={`${side.inner.left}%`}
          y={`${side.outer.top}%`}
          width={`${Math.max(0, side.inner.right - side.inner.left)}%`}
          height={`${Math.max(0, side.inner.top - side.outer.top)}%`}
          fill={OUTER_COLOR}
          fillOpacity={0.08}
        />
        {/* Bottom margin fill */}
        <rect
          x={`${side.inner.left}%`}
          y={`${side.inner.bottom}%`}
          width={`${Math.max(0, side.inner.right - side.inner.left)}%`}
          height={`${Math.max(0, side.outer.bottom - side.inner.bottom)}%`}
          fill={OUTER_COLOR}
          fillOpacity={0.08}
        />
      </svg>

      {allGuides.map(({ layer, key, isVerticalLine, color, label }) => {
        const pos = side[layer][key];
        const id = guideId(layer, key);
        const isActive = dragState?.guide.layer === layer && dragState?.guide.key === key || hoveredGuide === id;

        return (
          <div
            key={id}
            tabIndex={0}
            onFocus={() => setFocusedGuide({ layer, key })}
            onBlur={() => setFocusedGuide(null)}
            onPointerDown={(e) => handlePointerDown({ layer, key }, e)}
            onPointerEnter={() => setHoveredGuide(id)}
            onPointerLeave={() => setHoveredGuide(null)}
            className="absolute outline-none"
            style={
              isVerticalLine
                ? {
                    left: `${pos}%`,
                    top: 0,
                    bottom: 0,
                    width: 24,
                    marginLeft: -12,
                    cursor: "ew-resize",
                    zIndex: isActive ? 20 : 10,
                  }
                : {
                    top: `${pos}%`,
                    left: 0,
                    right: 0,
                    height: 24,
                    marginTop: -12,
                    cursor: "ns-resize",
                    zIndex: isActive ? 20 : 10,
                  }
            }
          >
            {/* Dotted guide line */}
            <div
              className="absolute"
              style={
                isVerticalLine
                  ? {
                      left: 12,
                      top: 0,
                      bottom: 0,
                      width: 0,
                      borderLeft: `${isActive ? 3 : 2}px dashed ${color}`,
                      opacity: isActive ? 1 : 0.7,
                    }
                  : {
                      top: 12,
                      left: 0,
                      right: 0,
                      height: 0,
                      borderTop: `${isActive ? 3 : 2}px dashed ${color}`,
                      opacity: isActive ? 1 : 0.7,
                    }
              }
            />
            {/* Label */}
            <div
              className="absolute text-xs font-mono px-1.5 py-0.5 rounded shadow-sm whitespace-nowrap"
              style={{
                backgroundColor: color,
                color: "#fff",
                ...(isVerticalLine
                  ? { left: 18, top: "50%", transform: "translateY(-50%)" }
                  : { top: 18, left: "50%", transform: "translateX(-50%)" }),
                fontSize: 11,
                opacity: isActive ? 1 : 0,
                transition: "opacity 0.15s",
              }}
            >
              {label} {pos.toFixed(1)}%
            </div>
          </div>
        );
      })}

      {/* Zoom lens while dragging */}
      {dragState && mousePos && side.imageSrc && (
        <ZoomLens
          imageSrc={side.imageSrc}
          imageWidth={side.imageWidth}
          imageHeight={side.imageHeight}
          containerRef={containerRef}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
        />
      )}
    </div>
  );
}
