/**
 * Browser-side image compression.
 *
 * The camera on modern phones produces 12 MP JPEGs (~3-6 MB). Sending those
 * for OCR is wasteful; we resize so the longest side is around 1600 px and
 * re-encode at JPEG quality 0.85. This usually lands under 400 KB while
 * keeping the OCR-relevant detail. Runs in the browser only - returns the
 * original `File` if `createImageBitmap` is unavailable (older WebViews).
 */
const TARGET_LONG_SIDE = 1600;
const JPEG_QUALITY = 0.85;

/** Returns `true` if the host supports the canvas + ImageBitmap pipeline. */
export function canCompress(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof document.createElement("canvas").getContext === "function" &&
    typeof createImageBitmap === "function"
  );
}

/** Pick a `File` (or Blob) and produce a compressed JPEG `File`. */
export async function compressImage(file: File): Promise<File> {
  if (!canCompress()) return file;
  // SVG / animated GIF / anything not raster: leave alone.
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) return file;

  const bitmap = await createImageBitmap(file);
  const scale =
    bitmap.width >= bitmap.height
      ? TARGET_LONG_SIDE / bitmap.width
      : TARGET_LONG_SIDE / bitmap.height;
  const w = Math.round(Math.min(1, scale) * bitmap.width);
  const h = Math.round(Math.min(1, scale) * bitmap.height);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      JPEG_QUALITY,
    ),
  );

  const compressed = new File(
    [blob],
    (file.name || "label.jpg").replace(/\.[^.]+$/, "") + ".jpg",
    { type: "image/jpeg" },
  );
  // If our compressed output ended up larger than the input, send the original.
  return compressed.size < file.size ? compressed : file;
}