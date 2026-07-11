// Client-side compressie van bonfoto's vóór upload: max 1600px langste zijde,
// JPEG kwaliteit 0.8 — telefoonsfoto's van ~4MB worden zo ~200-400KB.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.8;

async function loadImageSource(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // from-image: respecteer EXIF-rotatie van telefooncamera's.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Val terug op <img> (bijv. oudere Safari zonder opties-support).
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Kon afbeelding niet laden"));
    };
    img.src = url;
  });
}

export async function compressImage(file: Blob): Promise<Blob> {
  const source = await loadImageSource(file);
  const width = "naturalWidth" in source ? source.naturalWidth : source.width;
  const height = "naturalHeight" in source ? source.naturalHeight : source.height;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height, 1));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas niet beschikbaar");
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Kon afbeelding niet comprimeren");
  return blob;
}

/** Blob → kale base64-string (zonder data:-prefix), voor /api/parse-receipt. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Kon afbeelding niet lezen"));
    reader.readAsDataURL(blob);
  });
}
