// 0 restores automatic mapping, 1–8 choose filament slots, 255 erases.
export function decodeCleanupPixels(data: Uint8ClampedArray): Uint8Array {
  const mask = new Uint8Array(data.length / 4);
  for (let i = 0; i < mask.length; i++) {
    const code = data[i * 4];
    if (data[i * 4 + 3] >= 128 && ((code >= 1 && code <= 8) || code === 255))
      mask[i] = code;
  }
  return mask;
}
export async function loadCleanupMask(
  source: string,
  width: number,
  height: number,
): Promise<Uint8Array | undefined> {
  if (!source) return undefined;
  const image = new Image();
  image.src = source;
  try {
    await image.decode();
  } catch {
    throw new Error(
      "The cleanup layer could not be read. Undo the last edit or reset cleanup.",
    );
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, width, height);
  return decodeCleanupPixels(ctx.getImageData(0, 0, width, height).data);
}
