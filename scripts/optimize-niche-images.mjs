#!/usr/bin/env node
// Optimiza las imágenes de las landings por rubro (docs/landings-por-rubro.md).
//
// Los originales salen de Higgsfield (gpt_image_2_6, 4:5, 1792×2240 PNG, unos
// 6 MB cada uno) y no se suben al repo. Este script deja en
// public/landing/niches/:
//   <id>.webp     1200×1500, para el hero y las tarjetas de la home
//                 (next/image genera los tamaños menores).
//   <id>-og.jpg   1200×630, la imagen al compartir el enlace (WhatsApp, redes).
//
// Uso: node scripts/optimize-niche-images.mjs <carpeta con dental.png, estetica.png…>

import { mkdir, readdir } from 'node:fs/promises';
import { join, parse } from 'node:path';
import sharp from 'sharp';

const IDS = ['dental', 'estetica', 'fitness', 'academias', 'turismo', 'hogar', 'agencias'];
const OUT = join(process.cwd(), 'public', 'landing', 'niches');

const src = process.argv[2];
if (!src) {
  console.error('Uso: node scripts/optimize-niche-images.mjs <carpeta de originales>');
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
const files = (await readdir(src)).filter((f) => IDS.includes(parse(f).name));

for (const file of files) {
  const id = parse(file).name;
  const input = join(src, file);
  await sharp(input).resize(1200, 1500, { fit: 'cover' }).webp({ quality: 78 }).toFile(join(OUT, `${id}.webp`));
  // Recorte apaisado: `attention` centra lo más llamativo (la persona, el teléfono).
  await sharp(input)
    .resize(1200, 630, { fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 80, mozjpeg: true })
    .toFile(join(OUT, `${id}-og.jpg`));
  console.log(`✓ ${id}`);
}

const missing = IDS.filter((id) => !files.some((f) => parse(f).name === id));
if (missing.length) console.warn(`Faltan originales: ${missing.join(', ')}`);
