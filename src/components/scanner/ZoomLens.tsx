import { useRef, useEffect, type RefObject } from "react";

interface ZoomLensProps {
  imageSrc: string;
  imageWidth: number;
  imageHeight: number;
  containerRef: RefObject<HTMLDivElement | null>;
  mouseX: number;
  mouseY: number;
}

const LENS_SIZE = 120;
const ZOOM_LEVEL = 4;

export function ZoomLens({ imageSrc, imageWidth, imageHeight, containerRef, mouseX, mouseY }: ZoomLensProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!imgRef.current) {
      imgRef.current = new Image();
      imgRef.current.src = imageSrc;
    }
  }, [imageSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    const container = containerRef.current;
    if (!canvas || !img || !container || !img.complete) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const containerRect = container.getBoundingClientRect();
    const scaleX = imageWidth / containerRect.width;
    const scaleY = imageHeight / containerRect.height;

    const srcX = mouseX * scaleX;
    const srcY = mouseY * scaleY;
    const srcSize = LENS_SIZE / ZOOM_LEVEL;

    ctx.clearRect(0, 0, LENS_SIZE, LENS_SIZE);

    ctx.save();
    ctx.beginPath();
    ctx.arc(LENS_SIZE / 2, LENS_SIZE / 2, LENS_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(
      img,
      srcX - srcSize / 2 * scaleX,
      srcY - srcSize / 2 * scaleY,
      srcSize * scaleX,
      srcSize * scaleY,
      0,
      0,
      LENS_SIZE,
      LENS_SIZE
    );

    // Crosshair
    ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(LENS_SIZE / 2, 0);
    ctx.lineTo(LENS_SIZE / 2, LENS_SIZE);
    ctx.moveTo(0, LENS_SIZE / 2);
    ctx.lineTo(LENS_SIZE, LENS_SIZE / 2);
    ctx.stroke();

    ctx.restore();

    // Border
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(LENS_SIZE / 2, LENS_SIZE / 2, LENS_SIZE / 2 - 1, 0, Math.PI * 2);
    ctx.stroke();
  }, [mouseX, mouseY, imageWidth, imageHeight, containerRef]);

  const container = containerRef.current;
  if (!container) return null;

  const rect = container.getBoundingClientRect();
  let lensX = mouseX + 20;
  let lensY = mouseY - LENS_SIZE / 2;

  if (lensX + LENS_SIZE > rect.width) lensX = mouseX - LENS_SIZE - 20;
  if (lensY < 0) lensY = 0;
  if (lensY + LENS_SIZE > rect.height) lensY = rect.height - LENS_SIZE;

  return (
    <canvas
      ref={canvasRef}
      width={LENS_SIZE}
      height={LENS_SIZE}
      className="absolute pointer-events-none shadow-2xl"
      style={{
        left: lensX,
        top: lensY,
        width: LENS_SIZE,
        height: LENS_SIZE,
        borderRadius: "50%",
        zIndex: 30,
      }}
    />
  );
}
