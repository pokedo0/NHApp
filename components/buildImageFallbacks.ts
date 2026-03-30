export const buildImageFallbacks = (url: string): string[] => {
  const cleaned = (url || "").trim().replace(/\.webp\.webp$/i, ".webp");
  if (!cleaned) return [];
  const m = cleaned.match(/^(.*)\.(jpg|jpeg|png|webp|gif)$/i);
  if (!m) return [cleaned];
  const base = m[1];
  const ext = (m[2].toLowerCase() === "jpeg" ? "jpg" : m[2].toLowerCase()) as string;
  const exts = ["jpg", "png", "webp", "gif"];
  const ordered = [ext, ...exts].filter((e, i, self) => self.indexOf(e) === i);
  return ordered.map((e) => `${base}.${e}`);
};
