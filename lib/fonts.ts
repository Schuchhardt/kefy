// lib/fonts.ts
// Fuentes para el texto que se "quema" dentro de las imágenes (sharp + SVG).
//
// Por qué existe este archivo: sharp compone el texto vía librsvg/pango, que
// resuelve las familias tipográficas con **fontconfig**. En el runtime de
// Vercel (Amazon Linux) no hay ninguna fuente instalada, así que un
// `font-family="Arial, Helvetica, sans-serif"` no resolvía a nada y cada
// glifo se dibujaba como el glifo `.notdef`: los cuadraditos vacíos que
// aparecían encima de los slides del carrusel.
//
// La solución es no depender del sistema: la app trae sus propias fuentes en
// `assets/fonts/` y genera un `fonts.conf` que las expone vía `FONTCONFIG_PATH`
// antes de que sharp toque texto por primera vez.
//
// OJO: los `.ttf` se leen del filesystem en runtime, así que tienen que viajar
// con la función serverless — ver `outputFileTracingIncludes` en `next.config.ts`.

import fs from 'fs';
import os from 'os';
import path from 'path';

/** Familia que hay que usar en los SVG. Coincide con el nombre interno del TTF. */
export const BAKED_TEXT_FONT_FAMILY = 'Liberation Sans';

/** Los archivos que tienen que existir para que el texto se pueda renderizar. */
export const BUNDLED_FONT_FILES = [
  'LiberationSans-Regular.ttf',
  'LiberationSans-Bold.ttf',
] as const;

/** Directorio con las fuentes que viajan en el repo. */
export function bundledFontsDir(): string {
  return path.join(process.cwd(), 'assets', 'fonts');
}

/**
 * Contenido del `fonts.conf` que se le entrega a fontconfig.
 *
 * Se declara el directorio propio **primero** y luego los directorios de
 * sistema habituales: si el host sí tiene fuentes (macOS en desarrollo,
 * runners de CI) siguen disponibles como fallback, pero la resolución nunca
 * depende de que existan.
 */
export function buildFontConfig(fontsDir: string, cacheDir: string): string {
  return `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontsDir}</dir>
  <dir>/usr/share/fonts</dir>
  <dir>/usr/local/share/fonts</dir>
  <dir>/System/Library/Fonts</dir>
  <cachedir>${cacheDir}</cachedir>
  <match target="pattern">
    <test qual="any" name="family"><string>sans-serif</string></test>
    <edit name="family" mode="prepend" binding="strong"><string>${BAKED_TEXT_FONT_FAMILY}</string></edit>
  </match>
</fontconfig>
`;
}

let configuredPath: string | null = null;

/**
 * Deja fontconfig apuntando a las fuentes propias. Idempotente y barata: solo
 * escribe el `fonts.conf` la primera vez.
 *
 * Devuelve el `FONTCONFIG_PATH` aplicado, o `null` si no se pudo configurar
 * (en cuyo caso el llamador debe asumir que el texto quizá no renderice).
 */
export function ensureFontsConfigured(): string | null {
  if (configuredPath) return configuredPath;

  const fontsDir = bundledFontsDir();
  if (!fs.existsSync(fontsDir)) return null;

  // El único directorio con permiso de escritura en serverless es /tmp.
  const confDir  = path.join(os.tmpdir(), 'kefy-fontconfig');
  const cacheDir = path.join(confDir, 'cache');

  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(confDir, 'fonts.conf'), buildFontConfig(fontsDir, cacheDir), 'utf-8');
  } catch {
    return null;
  }

  process.env.FONTCONFIG_PATH = confDir;
  configuredPath = confDir;
  return confDir;
}

/** Solo para tests: olvida la configuración cacheada. */
export function resetFontsConfiguredForTests(): void {
  configuredPath = null;
}
