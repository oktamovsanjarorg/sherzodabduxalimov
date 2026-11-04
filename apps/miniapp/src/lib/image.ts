/**
 * Chek rasmini yuborishdan oldin siqadi: uzun tomoni 1600px, JPEG. Telefondagi 5–10 MB
 * skrinshot 200–500 KB ga tushadi, sekin internetda ham tez yuklanadi.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await loadImage(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; // shaffof PNG qora bo'lib qolmasin
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", quality));
  if (!blob) throw new Error("Rasmni o'qib bo'lmadi");
  return blob;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Bu faylni rasm sifatida ochib bo'lmadi"));
    };
    img.src = url;
  });
}
