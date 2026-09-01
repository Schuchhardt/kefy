// scripts/fetch-brand-fonts.mjs
//
// Descarga a `assets/fonts/` los TTF de todas las tipografías del catálogo
// (`lib/google-fonts.ts`), en los pesos 400 y 700.
//
// Se guardan en el repo a propósito: así el texto que se quema dentro de las
// imágenes se dibuja sin salir a la red, que en serverless es medio segundo
// largo la primera vez por lambda y un punto de fallo más en mitad de una
// publicación.
//
// Se pide TTF con un User-Agent antiguo: a los navegadores modernos la API de
// Google responde woff2, y fontconfig no sabe leer woff2.
//
// Uso:  node scripts/fetch-brand-fonts.mjs [--force]
// Correr tras añadir o quitar fuentes de GOOGLE_FONT_OPTIONS.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root      = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog   = path.join(root, 'lib', 'google-fonts.ts');
const fontsDir  = path.join(root, 'assets', 'fonts');
const force     = process.argv.includes('--force');

const WEIGHTS   = [400, 700];
const LEGACY_UA = 'Mozilla/4.0';

/** Las familias salen del catálogo real, para que no puedan desincronizarse. */
function readFamilies() {
  const source = fs.readFileSync(catalog, 'utf-8');
  const block  = source.slice(
    source.indexOf('GOOGLE_FONT_OPTIONS'),
    source.indexOf('];', source.indexOf('GOOGLE_FONT_OPTIONS')),
  );
  const families = [...block.matchAll(/value:\s*'([^']+)'/g)].map((m) => m[1]);
  if (families.length === 0) throw new Error('No se encontró ninguna fuente en el catálogo');
  return families;
}

/** Mismo nombre de archivo que espera `fontFileName()` en lib/fonts.ts. */
function fileNameFor(family, weight) {
  return `${family.replace(/[^A-Za-z0-9]+/g, '-')}-${weight}.ttf`;
}

async function ttfUrlsFor(family) {
  const name = encodeURIComponent(family).replace(/%20/g, '+');
  const url  = `https://fonts.googleapis.com/css2?family=${name}:wght@${WEIGHTS.join(';')}`;

  let res = await fetch(url, { headers: { 'User-Agent': LEGACY_UA } });

  // Hay familias con un solo peso (Bebas Neue, por ejemplo): pedir 700 da 400
  // Bad Request. Se reintenta sin pesos y se reutiliza la única cara que haya.
  if (!res.ok) {
    res = await fetch(`https://fonts.googleapis.com/css2?family=${name}`, {
      headers: { 'User-Agent': LEGACY_UA },
    });
  }
  if (!res.ok) throw new Error(`CSS HTTP ${res.status}`);

  const urls = [...(await res.text()).matchAll(/url\((https:\/\/[^)]+\.ttf)\)/g)].map((m) => m[1]);
  if (urls.length === 0) throw new Error('la respuesta no traía ningún TTF');
  return urls;
}

async function download(family) {
  const targets = WEIGHTS.map((w) => path.join(fontsDir, fileNameFor(family, w)));
  if (!force && targets.every((t) => fs.existsSync(t))) return 'cacheada';

  const urls = await ttfUrlsFor(family);

  await Promise.all(WEIGHTS.map(async (weight, i) => {
    const url = urls[i] ?? urls[urls.length - 1];
    const res = await fetch(url);
    if (!res.ok) throw new Error(`TTF HTTP ${res.status}`);
    fs.writeFileSync(path.join(fontsDir, fileNameFor(family, weight)), Buffer.from(await res.arrayBuffer()));
  }));

  return 'descargada';
}

const families = readFamilies();
fs.mkdirSync(fontsDir, { recursive: true });

console.log(`Descargando ${families.length} tipografías (pesos ${WEIGHTS.join(', ')})…\n`);

let failed = 0;
for (const family of families) {
  try {
    const status = await download(family);
    console.log(`  ✓ ${family} — ${status}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${family} — ${err.message}`);
  }
}

const bytes = fs.readdirSync(fontsDir)
  .filter((f) => f.endsWith('.ttf'))
  .reduce((acc, f) => acc + fs.statSync(path.join(fontsDir, f)).size, 0);

console.log(`\n${(bytes / 1024 / 1024).toFixed(1)} MB en assets/fonts/`);

if (failed > 0) {
  console.error(`\n${failed} tipografía(s) no se pudieron descargar.`);
  process.exit(1);
}
