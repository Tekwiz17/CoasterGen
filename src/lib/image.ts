import type { Project } from "../types";
export async function loadPixels(source: string, detail: number) {
  const image = new Image();
  image.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(
        new Error(
          "This image could not be read. Try PNG, JPG, WebP, or a self-contained SVG.",
        ),
      );
    image.src = source;
  });
  const width = Math.max(
    1,
    Math.round(detail * Math.min(1, image.naturalWidth / image.naturalHeight)),
  );
  const height = Math.max(
    1,
    Math.round(detail * Math.min(1, image.naturalHeight / image.naturalWidth)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, width, height);
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}
export async function readArtwork(file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024)
    throw new Error("Choose an image under 20 MB.");
  if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name))
    throw new Error("Choose a PNG, JPG, WebP, or SVG image.");
  if (/\.svg$/i.test(file.name)) {
    const raw = await file.text();
    const doc = new DOMParser().parseFromString(raw, "image/svg+xml");
    if (
      doc.querySelector("parsererror") ||
      doc.documentElement.localName !== "svg"
    )
      throw new Error("This SVG is invalid. Try exporting it again.");
    // Inline local SVG class rules before removing stylesheets. Many exported
    // logos use classes for every fill; deleting those rules turns them black.
    for (const style of Array.from(doc.querySelectorAll("style")).reverse()) {
      try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(style.textContent ?? "");
        for (const rule of Array.from(sheet.cssRules).reverse()) {
          if (!(rule instanceof CSSStyleRule)) continue;
          for (const el of doc.querySelectorAll(rule.selectorText)) {
            const existing = el.getAttribute("style") ?? "";
            el.setAttribute("style", rule.style.cssText + ";" + existing);
          }
        }
      } catch {
        /* Unsupported selectors are ignored; presentation attributes remain. */
      }
    }
    doc
      .querySelectorAll(
        "script,foreignObject,iframe,object,embed,style,animate,animateTransform,set",
      )
      .forEach((x) => x.remove());
    for (const el of doc.querySelectorAll("*"))
      for (const a of Array.from(el.attributes)) {
        if (
          /^on/i.test(a.name) ||
          (/href$/i.test(a.name) &&
            !a.value.startsWith("#") &&
            !(
              el.localName === "image" &&
              /^data:image\/(png|jpeg|webp);base64,/i.test(a.value)
            )) ||
          [...a.value.matchAll(/url\(([^)]*)\)/gi)].some(
            (match) => !/^\s*["']?#[^"'\s]+["']?\s*$/.test(match[1]),
          )
        )
          el.removeAttribute(a.name);
      }
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(doc.documentElement))}`;
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Unable to read this image."));
    r.readAsDataURL(file);
  });
}
export function download(data: BlobPart, name: string, type: string) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export const filename = (p: Project) =>
  p.name
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "my-coaster";
