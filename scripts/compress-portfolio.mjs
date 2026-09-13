#!/usr/bin/env node
/**
 * Comprime o acervo real de portfólio (H:\Meu Drive\Frame Search\- Portfólio\Portfólio - Propósta)
 * para versões leves de web, gera poster (thumbnail) para lazy-load, e grava um manifesto
 * público (public/video/portfolio.json) consumido pelo carrossel no front-end.
 *
 * Uso: node scripts/compress-portfolio.mjs
 *
 * Requisitos: ffmpeg e ffprobe no PATH (confirmados nesta máquina em 2026-09-13).
 */
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_VIDEO_DIR = join(ROOT, "public", "video", "portfolio");
const OUT_POSTER_DIR = join(ROOT, "public", "video", "posters");
const MANIFEST_SRC = join(__dirname, "portfolio-manifest.json");
const MANIFEST_OUT = join(ROOT, "public", "video", "portfolio.json");

const TARGET_HEIGHT_VERTICAL = 1280; // ~720x1280, suficiente para card de carrossel
const TARGET_HEIGHT_HORIZONTAL = 720; // ~1280x720
const CRF = 27; // qualidade web, arquivo pequeno
const PRESET = "veryfast";

function probe(path) {
  const res = spawnSync(
    "ffprobe",
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,duration",
      "-of", "json",
      path,
    ],
    { encoding: "utf-8" }
  );
  if (res.status !== 0) {
    throw new Error(`ffprobe falhou em ${path}: ${res.stderr}`);
  }
  const data = JSON.parse(res.stdout);
  const stream = data.streams?.[0];
  if (!stream) throw new Error(`Sem stream de vídeo em ${path}`);
  return {
    width: Number(stream.width),
    height: Number(stream.height),
    duration: Number(stream.duration) || null,
  };
}

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function compress(src, destMp4, isVertical) {
  const targetH = isVertical ? TARGET_HEIGHT_VERTICAL : TARGET_HEIGHT_HORIZONTAL;
  // Escala mantendo proporção, altura par (necessário para h264), sem upscale.
  const scaleFilter = `scale=-2:'min(${targetH},ih)'`;
  const args = [
    "-y",
    "-i", src,
    "-vf", scaleFilter,
    "-c:v", "libx264",
    "-preset", PRESET,
    "-crf", String(CRF),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "96k",
    "-ac", "2",
    destMp4,
  ];
  const res = spawnSync("ffmpeg", args, { encoding: "utf-8" });
  if (res.status !== 0) {
    throw new Error(`ffmpeg falhou em ${src}:\n${res.stderr?.slice(-2000)}`);
  }
}

function poster(src, destJpg, timestampSec) {
  const args = [
    "-y",
    "-ss", String(timestampSec),
    "-i", src,
    "-frames:v", "1",
    "-q:v", "4",
    destJpg,
  ];
  const res = spawnSync("ffmpeg", args, { encoding: "utf-8" });
  if (res.status !== 0) {
    throw new Error(`poster falhou em ${src}:\n${res.stderr?.slice(-2000)}`);
  }
}

function main() {
  ensureDir(OUT_VIDEO_DIR);
  ensureDir(OUT_POSTER_DIR);

  const manifest = JSON.parse(readFileSync(MANIFEST_SRC, "utf-8"));
  const outManifest = [];

  for (const item of manifest) {
    const src = item.src;
    if (!existsSync(src)) {
      console.error(`[PULADO] fonte não encontrada: ${src}`);
      continue;
    }
    console.log(`Processando: ${item.title} (${item.slug})`);
    const info = probe(src);
    const isVertical = info.height > info.width;
    const destMp4 = join(OUT_VIDEO_DIR, `${item.slug}.mp4`);
    const destJpg = join(OUT_POSTER_DIR, `${item.slug}.jpg`);
    const posterTs = info.duration ? Math.min(1, info.duration / 4) : 0.5;

    compress(src, destMp4, isVertical);
    poster(destMp4, destJpg, posterTs);

    outManifest.push({
      slug: item.slug,
      title: item.title,
      category: item.category,
      orientation: isVertical ? "vertical" : "horizontal",
      video: `/video/portfolio/${item.slug}.mp4`,
      poster: `/video/posters/${item.slug}.jpg`,
    });
  }

  writeFileSync(MANIFEST_OUT, JSON.stringify(outManifest, null, 2), "utf-8");
  console.log(`\nManifesto gravado em ${MANIFEST_OUT} (${outManifest.length} vídeos).`);
}

main();
