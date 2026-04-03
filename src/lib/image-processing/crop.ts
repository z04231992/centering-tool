/**
 * Crop an image around the detected card edges with a small margin.
 * Returns the cropped image data URL and the new guide positions
 * recalculated relative to the cropped image.
 */

interface GuidePositions {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface CropResult {
  croppedSrc: string;
  outer: GuidePositions;
  inner: GuidePositions;
}

/**
 * Crop the image to tightly frame the card with a small margin.
 * Recalculates outer/inner guide positions relative to the cropped region.
 *
 * @param margin - extra margin around outer edges as fraction (0.03 = 3%)
 */
export function cropAroundCard(
  imageSrc: string,
  outer: GuidePositions,
  inner: GuidePositions,
  margin = 0.03
): Promise<CropResult> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const { width: imgW, height: imgH } = img;

      // Convert percentage guides to pixels
      const outerLeftPx = (outer.left / 100) * imgW;
      const outerRightPx = (outer.right / 100) * imgW;
      const outerTopPx = (outer.top / 100) * imgH;
      const outerBottomPx = (outer.bottom / 100) * imgH;

      const cardW = outerRightPx - outerLeftPx;
      const cardH = outerBottomPx - outerTopPx;

      // Add margin around the card
      const marginX = cardW * margin;
      const marginY = cardH * margin;

      // Crop region (clamped to image bounds)
      const cropLeft = Math.max(0, outerLeftPx - marginX);
      const cropTop = Math.max(0, outerTopPx - marginY);
      const cropRight = Math.min(imgW, outerRightPx + marginX);
      const cropBottom = Math.min(imgH, outerBottomPx + marginY);
      const cropW = cropRight - cropLeft;
      const cropH = cropBottom - cropTop;

      // Draw cropped region onto a new canvas
      const canvas = document.createElement("canvas");
      canvas.width = cropW;
      canvas.height = cropH;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, cropLeft, cropTop, cropW, cropH, 0, 0, cropW, cropH);

      // Recalculate guide positions relative to the cropped image
      const newOuter: GuidePositions = {
        left: ((outerLeftPx - cropLeft) / cropW) * 100,
        right: ((outerRightPx - cropLeft) / cropW) * 100,
        top: ((outerTopPx - cropTop) / cropH) * 100,
        bottom: ((outerBottomPx - cropTop) / cropH) * 100,
      };

      const innerLeftPx = (inner.left / 100) * imgW;
      const innerRightPx = (inner.right / 100) * imgW;
      const innerTopPx = (inner.top / 100) * imgH;
      const innerBottomPx = (inner.bottom / 100) * imgH;

      const newInner: GuidePositions = {
        left: ((innerLeftPx - cropLeft) / cropW) * 100,
        right: ((innerRightPx - cropLeft) / cropW) * 100,
        top: ((innerTopPx - cropTop) / cropH) * 100,
        bottom: ((innerBottomPx - cropTop) / cropH) * 100,
      };

      resolve({
        croppedSrc: canvas.toDataURL("image/jpeg", 0.92),
        outer: newOuter,
        inner: newInner,
      });
    };
    img.onerror = () => reject(new Error("Failed to load image for cropping"));
    img.src = imageSrc;
  });
}
