/**
 * Rotate an image by a given angle (in degrees) around its center.
 * Returns a new data URL with the rotated image.
 * The output canvas is sized to fully contain the rotated image (no cropping).
 */
export function rotateImageSrc(
  imageSrc: string,
  angleDeg: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (angleDeg === 0) {
      resolve(imageSrc);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const rad = (angleDeg * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));

      // New dimensions to contain the rotated image without cropping
      const newW = Math.ceil(img.width * cos + img.height * sin);
      const newH = Math.ceil(img.width * sin + img.height * cos);

      const canvas = document.createElement("canvas");
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext("2d")!;

      // Fill with black background (matches warp background)
      ctx.fillStyle = "#1e1e1e";
      ctx.fillRect(0, 0, newW, newH);

      // Translate to center, rotate, draw image centered
      ctx.translate(newW / 2, newH / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      resolve(canvas.toDataURL("image/jpeg", 0.92));
    };
    img.onerror = () => reject(new Error("Failed to load image for rotation"));
    img.src = imageSrc;
  });
}
