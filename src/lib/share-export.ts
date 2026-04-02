/**
 * Share Export — renders the card image with guidelines and grades
 * onto a canvas matching the site's forest green dark theme.
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

// === THEME COLORS (match index.css dark forest theme) ===
const THEME = {
  bg: "#0d1b16",
  card: "#111e19",
  cardBorder: "#1e3029",
  foreground: "#f6fff8",
  primary: "#6b9080",
  muted: "#1a2b24",
  mutedFg: "#a4c3b2",
  border: "#1e3029",
  inputBg: "#2a4038",
};

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

export async function generateShareImage(options: ShareExportOptions): Promise<string> {
  const {
    imageSrc, outer, inner,
    outerColor, innerColor,
    frontRatio, grades, hasBack,
  } = options;

  const [img, logo] = await Promise.all([
    loadImage(imageSrc),
    loadImage("/pikachu-logo.png").catch(() => null),
  ]);

  // Layout
  const PANEL_WIDTH = 380;
  const PAD = 24;
  const HEADER_H = 56;
  const cardW = img.width;
  const cardH = img.height;

  const maxCardH = 820;
  const scale = Math.min(1, maxCardH / cardH);
  const scaledW = Math.round(cardW * scale);
  const scaledH = Math.round(cardH * scale);

  const contentH = scaledH + HEADER_H + PAD * 2;
  const totalW = scaledW + PANEL_WIDTH;
  const totalH = Math.max(contentH, 520);

  const canvas = document.createElement("canvas");
  canvas.width = totalW;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d")!;

  // === BACKGROUND ===
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, totalW, totalH);

  // === HEADER BAR ===
  ctx.fillStyle = "rgba(17, 30, 25, 0.95)";
  ctx.fillRect(0, 0, totalW, HEADER_H);
  // Header bottom border
  ctx.strokeStyle = THEME.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, HEADER_H);
  ctx.lineTo(totalW, HEADER_H);
  ctx.stroke();

  // Logo + title in header
  const logoSize = 32;
  const headerY = Math.round((HEADER_H - logoSize) / 2);
  if (logo) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(logo, PAD, headerY, logoSize, logoSize);
    ctx.imageSmoothingEnabled = true;
  }
  ctx.fillStyle = THEME.foreground;
  ctx.font = "600 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText("Centering Tool", PAD + logoSize + 10, HEADER_H / 2 + 6);

  // centeringtool.com on right side of header
  ctx.fillStyle = THEME.mutedFg;
  ctx.font = "14px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  const siteText = "centeringtool.com";
  const siteW = ctx.measureText(siteText).width;
  ctx.fillText(siteText, totalW - PAD - siteW, HEADER_H / 2 + 5);

  // === CARD IMAGE ===
  const cardX = 0;
  const cardY = HEADER_H + PAD;
  ctx.drawImage(img, cardX, cardY, scaledW, scaledH);

  // === GUIDE LINES ON CARD ===
  const oL = (outer.left / 100) * scaledW + cardX;
  const oR = (outer.right / 100) * scaledW + cardX;
  const oT = (outer.top / 100) * scaledH + cardY;
  const oB = (outer.bottom / 100) * scaledH + cardY;
  const iL = (inner.left / 100) * scaledW + cardX;
  const iR = (inner.right / 100) * scaledW + cardX;
  const iT = (inner.top / 100) * scaledH + cardY;
  const iB = (inner.bottom / 100) * scaledH + cardY;

  // Hatched zones between outer and inner
  ctx.fillStyle = hexToRgba(outerColor, 0.18);
  ctx.fillRect(oL, oT, oR - oL, iT - oT);
  ctx.fillRect(oL, iB, oR - oL, oB - iB);
  ctx.fillRect(oL, iT, iL - oL, iB - iT);
  ctx.fillRect(iR, iT, oR - iR, iB - iT);

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
  let y = HEADER_H + PAD;

  // Panel background card
  const panelCardX = panelX + 12;
  const panelCardW = PANEL_WIDTH - 24;
  const panelCardH = totalH - HEADER_H - PAD * 2;

  roundRect(ctx, panelCardX, y, panelCardW, panelCardH, 12);
  ctx.fillStyle = THEME.card;
  ctx.fill();
  ctx.strokeStyle = THEME.cardBorder;
  ctx.lineWidth = 1;
  ctx.stroke();

  const px = panelCardX + PAD; // panel content x
  y += PAD;

  // === CENTERING RATIOS ===
  if (frontRatio) {
    const hL = Math.round(frontRatio.horizontal.leftPercent);
    const hR = Math.round(frontRatio.horizontal.rightPercent);
    const vT = Math.round(frontRatio.vertical.topPercent);
    const vB = Math.round(frontRatio.vertical.bottomPercent);

    ctx.fillStyle = THEME.mutedFg;
    ctx.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText("Front Centering", px, y + 13);
    y += 36;

    // Two columns — each centered in its half
    const colW = (panelCardW - PAD * 2) / 2;
    const col1Center = px + colW / 2;
    const col2Center = px + colW + colW / 2;

    // Horizontal ratio — centered in left column
    ctx.fillStyle = THEME.foreground;
    ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const hBoldText = `${hL}/${hR}`;
    const hBoldW = ctx.measureText(hBoldText).width;
    ctx.fillText(hBoldText, col1Center - hBoldW / 2, y + 30);

    // Vertical ratio — centered in right column
    const vBoldText = `${vT}/${vB}`;
    const vBoldW = ctx.measureText(vBoldText).width;
    ctx.fillText(vBoldText, col2Center - vBoldW / 2, y + 30);
    y += 50;

    // Sub-labels — centered under the bold numbers
    ctx.fillStyle = THEME.mutedFg;
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    const hSubText = `L ${hL} / R ${hR}`;
    const hSubW = ctx.measureText(hSubText).width;
    ctx.fillText(hSubText, col1Center - hSubW / 2, y);

    const vSubText = `T ${vT} / B ${vB}`;
    const vSubW = ctx.measureText(vSubText).width;
    ctx.fillText(vSubText, col2Center - vSubW / 2, y);
    y += 28;

    // Separator line
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, y);
    ctx.lineTo(panelCardX + panelCardW - PAD, y);
    ctx.stroke();
    y += 16;
  }

  // === GRADE COMPARISON ===
  ctx.fillStyle = THEME.mutedFg;
  ctx.font = "13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  ctx.fillText(hasBack ? "Grade Comparison" : "Grade Comparison (Front Only)", px, y + 13);
  y += 30;

  // Grade cards in 3x2 grid — larger and more readable
  const availW = panelCardW - PAD * 2;
  const gradeGap = 8;
  const cols = 3;
  const gradeCardW = Math.floor((availW - gradeGap * (cols - 1)) / cols);
  const gradeCardH = 110;

  for (let i = 0; i < grades.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const gx = px + col * (gradeCardW + gradeGap);
    const gy = y + row * (gradeCardH + gradeGap);

    const grade = grades[i];
    const hasGrade = grade.bestGrade !== null;

    // Grade card background
    roundRect(ctx, gx, gy, gradeCardW, gradeCardH, 8);
    ctx.fillStyle = hasGrade ? THEME.muted : hexToRgba(THEME.muted, 0.5);
    ctx.fill();
    ctx.strokeStyle = THEME.border;
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Company color dot + name
    ctx.fillStyle = grade.company.color;
    ctx.beginPath();
    ctx.arc(gx + 14, gy + 18, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = hasGrade ? THEME.foreground : THEME.mutedFg;
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillText(grade.company.name, gx + 26, gy + 22);

    if (hasGrade) {
      // Grade number — big and bold
      ctx.fillStyle = grade.company.color;
      ctx.font = "bold 36px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(String(grade.bestGrade!.numericGrade), gx + 10, gy + 64);

      // Grade label
      ctx.fillStyle = THEME.mutedFg;
      ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText(grade.bestGrade!.grade, gx + 10, gy + 80);

      // Thresholds
      if (grade.frontLimitingGrade) {
        const ft = grade.frontLimitingGrade.front.maxLargerSide;
        const bt = grade.frontLimitingGrade.back.maxLargerSide;
        ctx.fillStyle = hexToRgba(THEME.mutedFg, 0.65);
        ctx.font = "10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
        ctx.fillText(`Front: ${ft}/${100 - ft}`, gx + 10, gy + 95);
        if (hasBack) {
          ctx.fillText(`Back: ${bt}/${100 - bt}`, gx + 10, gy + 107);
        }
      }
    } else {
      ctx.fillStyle = hexToRgba(THEME.mutedFg, 0.4);
      ctx.font = "bold 28px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillText("-", gx + 10, gy + 58);
    }
  }

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
