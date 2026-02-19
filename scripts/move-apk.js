const fs = require("fs");
const path = require("path");
const pkg = require("../package.json");
const version = pkg.version || "0.0.0";
const srcApk = path.join(
  __dirname,
  "..",
  "android",
  "app",
  "build",
  "outputs",
  "apk",
  "release",
  "app-release.apk"
);
const outDir = path.join(__dirname, "..", "output_android");
const outApk = path.join(outDir, `NHApp-Android-Setup-${version}.apk`);
if (!fs.existsSync(srcApk)) {
  console.error(`❌  APK not found: ${srcApk}`);
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(srcApk, outApk);
console.log(`✅  Copied → ${outApk}`);
