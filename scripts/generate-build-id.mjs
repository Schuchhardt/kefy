#!/usr/bin/env node
/**
 * Genera `lib/generated/build-id.ts` con la versión de este build.
 *
 * Corre una sola vez por build (`prebuild` / `predev` / `postinstall`), así que
 * el valor queda escrito en un módulo normal: no importa cuántas veces Next
 * evalúe `next.config.ts` ni en cuántos procesos compile, toda la app se compila
 * contra la misma versión. Tampoco depende de ninguna variable de entorno.
 *
 * Ver `docs/pwa.md`.
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const OUTPUT_PATH = path.join(ROOT, 'lib', 'generated', 'build-id.ts');

/** Deja el identificador apto para nombres de cache y URLs. */
export function sanitizeBuildId(value) {
  return (
    value
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'build'
  );
}

/** Commit actual, si el build tiene el repo git a mano. */
export function readGitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Versión del build: `<commit>-<timestamp>`, o solo el timestamp si el commit
 * no está disponible (algunos proveedores no dejan el repo git en el build).
 *
 * El timestamp hace que cada build sea único, aunque se vuelva a desplegar el
 * mismo commit: un rollback o un redeploy también invalidan la cache.
 */
export function buildVersion(gitSha, now = Date.now()) {
  const commit = gitSha ? gitSha.slice(0, 8) : null;
  const stamp = now.toString(36);
  return sanitizeBuildId([commit, stamp].filter(Boolean).join('-'));
}

export function renderModule(version) {
  return [
    '// Archivo generado por scripts/generate-build-id.mjs — no editar ni commitear.',
    '// Se regenera en cada build (ver los scripts prebuild / predev / postinstall).',
    `export const APP_VERSION = '${version}';`,
    '',
  ].join('\n');
}

export function generateBuildIdFile(version = buildVersion(readGitSha())) {
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, renderModule(version));
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  console.log(`build id: ${generateBuildIdFile()}`);
}
