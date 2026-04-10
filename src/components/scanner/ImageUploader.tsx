import { Upload, Camera } from "lucide-react";
import { useCallback, useRef, useState, useEffect } from "react";
import { useMeasurementStore } from "@/stores/measurement-store";
import { preloadOpenCV } from "@/lib/image-processing/opencv-loader";

export function ImageUploader() {
  const { activeSide, setImage } = useMeasurementStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const processingRef = useRef(false);

  // Start loading OpenCV in background while user is on upload screen
  useEffect(() => { preloadOpenCV(); }, []);

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/") || processingRef.current) return;
      processingRef.current = true;
      const reader = new FileReader();
      reader.onload = (e) => {
        const src = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const maxDim = 2000;
          if (width > maxDim || height > maxDim) {
            const scale = maxDim / Math.max(width, height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          setImage(activeSide, src, width, height);
          // Keep the guard up — component will unmount after setImage
        };
        img.onerror = () => { processingRef.current = false; };
        img.src = src;
      };
      reader.onerror = () => { processingRef.current = false; };
      reader.readAsDataURL(file);
    },
    [activeSide, setImage]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      // Reset value so the same file can be re-selected later
      // Use longer delay to avoid re-triggering on mobile
      setTimeout(() => {
        if (e.target) e.target.value = "";
      }, 500);
    },
    [processFile]
  );

  const handleClick = useCallback(() => {
    if (processingRef.current) return;
    fileInputRef.current?.click();
  }, []);

  return (
    <div
      className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
        ${isDragging ? "border-primary bg-primary/5 scale-[1.02]" : "border-border hover:border-primary/50 hover:bg-accent/50"}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        id="camera-input"
        onChange={handleFileChange}
      />
      <div className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
          <Upload className="w-8 h-8 text-primary" />
        </div>
        <div>
          <p className="text-lg font-medium">
            Drop your card image here or click to upload
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            Uploading {activeSide} side - Supports JPG, PNG, WEBP
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            document.getElementById("camera-input")?.click();
          }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
        >
          <Camera className="w-4 h-4" />
          Use Camera
        </button>
      </div>
    </div>
  );
}
