/**
 * Share Export — renders the card image with guidelines and grades
 * onto a canvas and exports as a downloadable PNG.
 */

import type { CenteringRatio, GradeResult } from "./grading/types";

interface GuidePositions {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface ShareExportOptions {
  imageSrc: string;
  outer: GuidePositions;
  inner: GuidePositions;
  outerColor: string;
  innerColor: string;
  frontRatio: CenteringRatio | null;
  backRatio: CenteringRatio | null;
  grades: GradeResult[];
  hasBack: boolean;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export async function generateShareImage(options: ShareExportOptions): Promise<string> {
  const {
    imageSrc, outer, inner,
    outerColor, innerColor,
    frontRatio, grades, hasBack,
  } = options;

  const img = await loadImage(imageSrc);

  // Layout: card image on left, grades panel on right
  const PANEL_WIDTH = 360;
  const PADDING = 24;
  const cardW = img.width;
  const cardH = img.height;

  // Scale card to reasonable size (max 800px tall)
  const maxCardH = 800;
  const scale = Math.min(1, maxCardH / cardH);
  const scaledW = Math.round(cardW * scale);
  const scaledH = Math.round(cardH * scale);

  const totalW = scaledW + PANEL_WIDTH;
  const totalH = Math.max(scaledH, 500);

  const canvas = document.createElement("canvas");
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d")!;

  // Background
  ctx.fillStyle = "#0f1419";
  ctx.fillRect(0, 0, totalW, totalH);

  // Draw card image
  const cardOffsetY = Math.round((totalH - scaledH) / 2);
  ctx.drawImage(img, 0, cardOffsetY, scaledW, scaledH);

  // Draw guide lines on the card
  const oL = (outer.left / 100) * scaledW;
  const oR = (outer.right / 100) * scaledW;
  const oT = (outer.top / 100) * scaledH + cardOffsetY;
  const oB = (outer.bottom / 100) * scaledH + cardOffsetY;
  const iL = (inner.left / 100) * scaledW;
  const iR = (inner.right / 100) * scaledW;
  const iT = (inner.top / 100) * scaledH + cardOffsetY;
  const iB = (inner.bottom / 100) * scaledH + cardOffsetY;

  // Hatched zones between outer and inner
  ctx.fillStyle = hexToRgba(outerColor, 0.15);
  ctx.fillRect(oL, oT, oR - oL, iT - oT); // top
  ctx.fillRect(oL, iB, oR - oL, oB - iB); // bottom
  ctx.fillRect(oL, iT, iL - oL, iB - iT); // left
  ctx.fillRect(iR, iT, oR - iR, iB - iT); // right

  // Outer rectangle (dashed)
  ctx.strokeStyle = outerColor;
  ctx.lineWidth = 2.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(oL, oT, oR - oL, oB - oT);

  // Inner dark overlay
  ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
  ctx.fillRect(iL, iT, iR - iL, iB - iT);

  // Inner rectangle (dashed)
  ctx.strokeStyle = innerColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(iL, iT, iR - iL, iB - iT);
  ctx.setLineDash([]);

  // === RIGHT PANEL ===
  const panelX = scaledW;
  let y = PADDING;

  // Title
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("Centering Tool", panelX + PADDING, y + 22);
  y += 50;

  // Centering ratios
  if (frontRatio) {
    const hL = Math.round(frontRatio.horizontal.leftPercent);
    const hR = Math.round(frontRatio.horizontal.rightPercent);
    const vT = Math.round(frontRatio.vertical.topPercent);
    const vB = Math.round(frontRatio.vertical.bottomPercent);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("Front Centering", panelX + PADDING, y);
    y += 28;

    // Horizontal
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const hText = `${hL}/${hR}`;
    ctx.fillText(hText, panelX + PADDING, y);

    // Vertical
    const vText = `${vT}/${vB}`;
    ctx.fillText(vText, panelX + PADDING + 160, y);
    y += 20;

    // Labels
    ctx.fillStyle = "#64748b";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(`L ${hL} / R ${hR}`, panelX + PADDING, y);
    ctx.fillText(`T ${vT} / B ${vB}`, panelX + PADDING + 160, y);
    y += 30;

    // Separator
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + PADDING, y);
    ctx.lineTo(totalW - PADDING, y);
    ctx.stroke();
    y += 20;
  }

  // Grade comparison header
  ctx.fillStyle = "#94a3b8";
  ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(hasBack ? "Grade Comparison" : "Grade Comparison (Front Only)", panelX + PADDING, y);
  y += 24;

  // Draw grade cards in a 3x2 grid
  const gradeCardW = 100;
  const gradeCardH = 90;
  const gradeGap = 6;
  const cols = 3;

  for (let i = 0; i < grades.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const gx = panelX + PADDING + col * (gradeCardW + gradeGap);
    const gy = y + row * (gradeCardH + gradeGap);

    const grade = grades[i];
    const hasGrade = grade.bestGrade !== null;

    // Card background
    ctx.fillStyle = hasGrade ? "#1e293b" : "#111827";
    ctx.beginPath();
    ctx.roundRect(gx, gy, gradeCardW, gradeCardH, 8);
    ctx.fill();

    // Company dot + name
    ctx.fillStyle = grade.company.color;
    ctx.beginPath();
    ctx.arc(gx + 14, gy + 16, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hasGrade ? "#e2e8f0" : "#64748b";
    ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(grade.company.name, gx + 24, gy + 20);

    // Grade number
    if (hasGrade) {
      ctx.fillStyle = grade.company.color;
      ctx.font = "bold 26px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(String(grade.bestGrade!.numericGrade), gx + 12, gy + 52);

      // Grade label
      ctx.fillStyle = "#94a3b8";
      ctx.font = "9px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(grade.bestGrade!.grade, gx + 12, gy + 66);

      // Front threshold
      if (grade.frontLimitingGrade) {
        const ft = grade.frontLimitingGrade.front.maxLargerSide;
        const bt = grade.frontLimitingGrade.back.maxLargerSide;
        ctx.fillStyle = "#64748b";
        ctx.font = "9px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.fillText(`Front: ${ft}/${100 - ft}`, gx + 12, gy + 80);
        if (hasBack) {
          ctx.fillText(`Back: ${bt}/${100 - bt}`, gx + 12, gy + 90);
        }
      }
    } else {
      ctx.fillStyle = "#475569";
      ctx.font = "bold 20px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText("-", gx + 12, gy + 52);
    }
  }

  y += Math.ceil(grades.length / cols) * (gradeCardH + gradeGap) + 16;

  // Watermark
  ctx.fillStyle = "#475569";
  ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("cardcenteringtool.com", panelX + PADDING, totalH - PADDING);

  return canvas.toDataURL("image/png");
}

export function downloadShareImage(dataUrl: string) {
  const link = document.createElement("a");
  link.download = `centering-result-${Date.now()}.png`;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
