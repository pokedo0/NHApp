#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const ROOT = process.cwd();
const ANDROID_DIR = path.join(ROOT, "android");

// 1-й аргумент — папка-источник с твоими файлами (по умолчанию overrides/android)
const SRC_DIR = path.resolve(process.argv[2] || path.join(ROOT, "overrides", "android"));
const BACKUP_DIR = path.join(ANDROID_DIR, "_backup", timestamp());

// Сопоставления: источник → место назначения в android/
const MAP = [
  { src: "gradle.properties", dest: "gradle.properties" },               // android/gradle.properties
  { src: "build.gradle", dest: path.join("app", "build.gradle") },       // android/app/build.gradle
  { src: "proguard-rules.pro", dest: path.join("app", "proguard-rules.pro") } // android/app/proguard-rules.pro
];

(async () => {
  try {
    // Проверка входной папки
    if (!fs.existsSync(SRC_DIR)) {
      console.error(`[sync-android-files] Нет исходной папки: ${rel(SRC_DIR)}`);
      process.exit(2);
    }
    if (!fs.existsSync(ANDROID_DIR)) {
      console.error(`[sync-android-files] Нет папки android/. Запусти expo prebuild перед синхронизацией.`);
      process.exit(3);
    }

    let changed = 0;

    for (const item of MAP) {
      const src = path.join(SRC_DIR, item.src);
      const dest = path.join(ANDROID_DIR, item.dest);
      const destDir = path.dirname(dest);

      if (!fs.existsSync(src)) {
        console.log(gray(`[skip] нет файла ${rel(src)}`));
        continue;
      }
      await mkdirp(destDir);

      const needCopy = await isDifferent(src, dest);
      if (!needCopy) {
        console.log(`= ${rel(item.dest)} — без изменений`);
        continue;
      }

      // Бэкап, если есть что затирать
      if (fs.existsSync(dest)) {
        const backupPath = path.join(BACKUP_DIR, item.dest);
        await mkdirp(path.dirname(backupPath));
        await fsp.copyFile(dest, backupPath);
        console.log(gray(`↺ backup → ${rel(backupPath)}`));
      }

      // Копируем (fs.copyFile перезаписывает по умолчанию) :contentReference[oaicite:5]{index=5}
      await fsp.copyFile(src, dest);
      console.log(`→ ${rel(item.dest)} — обновлён`);
      changed++;
    }

    console.log(changed ? `[sync-android-files] Готово. Обновлено: ${changed}` : `[sync-android-files] Всё актуально.`);
    if (changed) console.log(gray(`[sync-android-files] Бэкапы: ${rel(BACKUP_DIR)}`));
  } catch (err) {
    console.error(`[sync-android-files] Ошибка: ${err.stack || err.message}`);
    process.exit(1);
  }
})();

/* ---------------- helpers ---------------- */
async function isDifferent(a, b) {
  if (!fs.existsSync(b)) return true;
  const [ha, hb] = await Promise.all([hash(a), hash(b)]);
  return ha !== hb;
}
async function hash(p) {
  const buf = await fsp.readFile(p);
  return crypto.createHash("sha256").update(buf).digest("hex");
}
async function mkdirp(dir) {
  await fsp.mkdir(dir, { recursive: true });
}
function timestamp() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}
function rel(p) {
  return path.relative(ROOT, p).replace(/\\/g, "/");
}
function gray(s) {
  return `\x1b[90m${s}\x1b[0m`;
}
