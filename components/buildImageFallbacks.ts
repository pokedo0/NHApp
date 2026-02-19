export const buildImageFallbacks = (url: string): string[] => {
  const m = url.match(/^(.*)\.(jpg|png|webp|gif)(\.webp)?$/i);
  if (!m) return [url];
  const base = m[1];
  const exts = ["jpg", "png", "webp", "gif"];
  const orig = m.slice(2).filter(Boolean).join(".");
  return [orig, ...exts]
    .filter((e, i, self) => self.indexOf(e) === i)
    .map((ext) => `${base}.${ext}`);
};
