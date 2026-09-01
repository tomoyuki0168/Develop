#!/usr/bin/env node
/**
 * 配布用のビルド
 *
 *   node build.js
 *
 * CSS・JS・データをすべて index.html に流し込み、1ファイルにまとめる。
 *  dist/kamigami-zukan.html  … 単体で開ける完全なHTML。メール添付・USB・社内共有用
 *  dist/artifact.html        … Artifact 公開用（doctype/html/head/body を持たない断片）
 *
 * 外部ファイルを一切参照しないので、オフラインでもそのまま動く。
 */
"use strict";
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const read = (p) => fs.readFileSync(path.join(dir, p), "utf8");

const html = read("index.html");
const css = read("assets/styles.css");
const js = read("assets/app.js");
const data = read("data/deities.js");

// </script> を含む文字列があるとタグが途中で閉じてしまうため無害化する
const safe = (s) => s.replace(/<\/script>/gi, "<\\/script>");

const inlined = html
  .replace('<link rel="stylesheet" href="assets/styles.css">', "<style>\n" + css + "\n</style>")
  .replace('<script src="data/deities.js"></script>', "<script>\n" + safe(data) + "\n</script>")
  .replace('<script src="assets/app.js"></script>', "<script>\n" + safe(js) + "\n</script>");

if (inlined.includes("assets/") || inlined.includes("data/deities.js")) {
  console.error("外部参照が残っています。index.html の参照名が変わっていないか確認してください。");
  process.exit(1);
}

fs.mkdirSync(path.join(dir, "dist"), { recursive: true });
fs.writeFileSync(path.join(dir, "dist/kamigami-zukan.html"), inlined);

// Artifact 版は骨組み（doctype / html / head / body）が公開時に付くため取り除く
const head = inlined.slice(inlined.indexOf("<head>") + 6, inlined.indexOf("</head>"));
const body = inlined.slice(inlined.indexOf("<body>") + 6, inlined.lastIndexOf("</body>"));
// <title> と <style>…</style> だけを丸ごと拾う（行単位で選ると CSS が欠ける）
const pick = (re) => (head.match(re) || []).join("\n");
const keep = [pick(/<title>[\s\S]*?<\/title>/g), pick(/<style>[\s\S]*?<\/style>/g)]
  .filter(Boolean).join("\n");
if (!/<title>/.test(keep) || keep.length < css.length) {
  console.error("Artifact 版の head 抽出に失敗しました。");
  process.exit(1);
}
fs.writeFileSync(path.join(dir, "dist/artifact.html"), keep.trim() + "\n" + body.trim() + "\n");

const kb = (p) => (fs.statSync(path.join(dir, p)).size / 1024).toFixed(0) + " KB";
console.log("dist/kamigami-zukan.html  " + kb("dist/kamigami-zukan.html"));
console.log("dist/artifact.html        " + kb("dist/artifact.html"));
