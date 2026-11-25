#!/usr/bin/env node
// Optimiza las imágenes de las landings (docs/landings-por-rubro.md).
//
// Los originales salen de Higgsfield (gpt_image_2_6, calidad alta, 2k; PNG de
// unos 6 MB) y no se suben al repo. Según el nombre del original:
//
//   <rubro>.png          → public/landing/niches/<rubro>.webp     1200×1500 (hero y tarjeta de la home)
//                        → public/landing/niches/<rubro>-og.jpg   1200×630  (al compartir el enlace)
//   <rubro>-ideas.png    → public/landing/niches/<rubro>-ideas.webp 1200×1500 (sección «ideas»)
//   offer-<oferta>.png   → public/landing/offers/<oferta>.webp    1200×800  (tarjetas de las dos ofertas)
//
// next/image genera los tamaños menores. Uso:
//   node scripts/optimize-niche-images.mjs <carpeta con los originales>

import { mkdir, readdir } from 'node:fs/promises';
import { join, parse } from 'node:path';
import sharp from 'sharp';

const NICHES = ['dental', 'estetica', 'fitness', 'academias', 'turismo', 'hogar', 'agencias'];
const OFFERS = ['platform', 'service'];
const PUBLIC = join(process.cwd(), 'public', 'landing');

const src = process.argv[2];
if (!src) {
  console.error('Uso: node scripts/optimize-niche-images.mjs <carpeta de originales>');
  process.exit(1);
}

await mkdir(join(PUBLIC, 'niches'), { recursive: true });
await mkdir(join(PUBLIC, 'offers'), { recursive: true });

const webp = (input, w, h, out) => sharp(input).resize(w, h, { fit: 'cover' }).webp({ quality: 78 }).toFile(out);

for (const file of await readdir(src)) {
  const name = parse(file).name;
  const input = join(src, file);

  if (NICHES.includes(name)) {
    await webp(input, 1200, 1500, join(PUBLIC, 'niches', `${name}.webp`));
    // Recorte apaisado: `attention` centra lo más llamativo (la persona, el teléfono).
    await sharp(input)
      .resize(1200, 630, { fit: 'cover', position: sharp.strategy.attention })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(join(PUBLIC, 'niches', `${name}-og.jpg`));
  } else if (name.endsWith('-ideas') && NICHES.includes(name.slice(0, -'-ideas'.length))) {
    await webp(input, 1200, 1500, join(PUBLIC, 'niches', `${name}.webp`));
  } else if (name.startsWith('offer-') && OFFERS.includes(name.slice('offer-'.length))) {
    await webp(input, 1200, 800, join(PUBLIC, 'offers', `${name.slice('offer-'.length)}.webp`));
  } else {
    continue;
  }
  console.log(`✓ ${name}`);
}
