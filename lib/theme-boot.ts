// ─── Tema: reglas compartidas por el script de arranque y ThemeProvider ──────
//
// - Las páginas públicas (landing, precios, blog, legales, login, registro…)
//   son siempre oscuras: están diseñadas sobre fondo negro con vídeo.
// - El dashboard respeta la preferencia guardada y, si no hay ninguna, la del
//   sistema (`prefers-color-scheme`). Antes arrancaba siempre en oscuro.
//
// THEME_BOOT_SCRIPT corre en <head> antes de pintar (app/layout.tsx) para que
// no haya un destello del tema equivocado; ThemeProvider aplica lo mismo en
// cada navegación del cliente.

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'kefy-theme';

/** Color de la barra del navegador / de estado para cada tema (= --bg). */
export const THEME_COLORS: Record<Theme, string> = {
  dark: '#08080A',
  light: '#F5F5F0',
};

const THEMED_PATH = /^\/[a-z]{2}\/dashboard(\/|$)/;

/** true si en esa ruta el usuario puede elegir tema (solo el dashboard). */
export function isThemedPath(pathname: string): boolean {
  return THEMED_PATH.test(pathname);
}

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light';
}

/** Tema a aplicar según la ruta, la preferencia guardada y la del sistema. */
export function resolveTheme(pathname: string, saved: string | null, systemPrefersLight: boolean): Theme {
  if (!isThemedPath(pathname)) return 'dark';
  if (isTheme(saved)) return saved;
  return systemPrefersLight ? 'light' : 'dark';
}

/** Pone data-theme en <html> y el color de la barra del navegador. */
export function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.setAttribute('content', THEME_COLORS[theme]);
  });
}

// El script no puede importar nada: se serializa con las mismas constantes.
export const THEME_BOOT_SCRIPT = `(function(){try{
var p=location.pathname,t='dark';
if(${THEMED_PATH.toString()}.test(p)){
var s=null;try{s=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}
if(s==='light'||s==='dark'){t=s}else if(window.matchMedia&&matchMedia('(prefers-color-scheme: light)').matches){t='light'}
}
document.documentElement.setAttribute('data-theme',t);
var c=${JSON.stringify(THEME_COLORS)}[t];
var set=function(){var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++){m[i].setAttribute('content',c)}};
set();document.addEventListener('DOMContentLoaded',set);
}catch(e){}})();`;
