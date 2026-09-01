// lib/google-fonts.ts
// Catálogo de tipografías del Brand Kit.
//
// Vive en `lib/` y no dentro del selector porque lo necesitan los dos lados:
// el cliente para elegir y previsualizar, y el servidor para descargar el TTF
// y escribir con esa misma fuente el texto que va dentro de la imagen. Si el
// catálogo viviera sólo en el componente `'use client'`, el servidor no podría
// validar contra él lo que viene de la base de datos.

export interface GoogleFontOption {
  value: string;
  family: string;
  category: string;
  preview: string;
}

export const GOOGLE_FONT_OPTIONS: GoogleFontOption[] = [
  { value: 'Syne', family: 'Syne, system-ui, sans-serif', category: 'Display', preview: 'Marca con carácter' },
  { value: 'DM Sans', family: '"DM Sans", system-ui, sans-serif', category: 'Sans', preview: 'Texto claro y moderno' },
  { value: 'Inter', family: 'Inter, system-ui, sans-serif', category: 'Sans', preview: 'Lectura limpia y precisa' },
  { value: 'Lato', family: 'Lato, system-ui, sans-serif', category: 'Sans', preview: 'Equilibrada y versátil' },
  { value: 'Poppins', family: 'Poppins, system-ui, sans-serif', category: 'Sans', preview: 'Presencia fresca y geométrica' },
  { value: 'Montserrat', family: 'Montserrat, system-ui, sans-serif', category: 'Sans', preview: 'Impacto visual sólido' },
  { value: 'Open Sans', family: '"Open Sans", system-ui, sans-serif', category: 'Sans', preview: 'Neutral y muy legible' },
  { value: 'Roboto', family: 'Roboto, system-ui, sans-serif', category: 'Sans', preview: 'Familiar y funcional' },
  { value: 'Oswald', family: 'Oswald, system-ui, sans-serif', category: 'Display', preview: 'Titulares con fuerza' },
  { value: 'Bebas Neue', family: '"Bebas Neue", system-ui, sans-serif', category: 'Display', preview: 'Cartelera y presencia' },
  { value: 'Space Grotesk', family: '"Space Grotesk", system-ui, sans-serif', category: 'Sans', preview: 'Digital y contemporánea' },
  { value: 'Manrope', family: 'Manrope, system-ui, sans-serif', category: 'Sans', preview: 'Elegancia funcional' },
  { value: 'Rubik', family: 'Rubik, system-ui, sans-serif', category: 'Sans', preview: 'Redondeada y amigable' },
  { value: 'Outfit', family: 'Outfit, system-ui, sans-serif', category: 'Sans', preview: 'Minimal y tecnológica' },
  { value: 'Urbanist', family: 'Urbanist, system-ui, sans-serif', category: 'Sans', preview: 'Limpia y futurista' },
  { value: 'Work Sans', family: '"Work Sans", system-ui, sans-serif', category: 'Sans', preview: 'Editorial y neutra' },
  { value: 'Figtree', family: 'Figtree, system-ui, sans-serif', category: 'Sans', preview: 'Suave y contemporánea' },
  { value: 'Archivo', family: 'Archivo, system-ui, sans-serif', category: 'Sans', preview: 'Nítida y confiable' },
  { value: 'Barlow', family: 'Barlow, system-ui, sans-serif', category: 'Sans', preview: 'Técnica y equilibrada' },
  { value: 'Playfair Display', family: '"Playfair Display", Georgia, serif', category: 'Serif', preview: 'Editorial y sofisticada' },
  { value: 'Lora', family: 'Lora, Georgia, serif', category: 'Serif', preview: 'Cálida y expresiva' },
  { value: 'Merriweather', family: 'Merriweather, Georgia, serif', category: 'Serif', preview: 'Lectura clásica' },
  { value: 'Libre Baskerville', family: '"Libre Baskerville", Georgia, serif', category: 'Serif', preview: 'Autoridad y tradición' },
  { value: 'Cormorant Garamond', family: '"Cormorant Garamond", Georgia, serif', category: 'Serif', preview: 'Lujo y contraste' },
  { value: 'Nunito', family: 'Nunito, system-ui, sans-serif', category: 'Sans', preview: 'Amigable y accesible' },
  { value: 'Source Sans 3', family: '"Source Sans 3", system-ui, sans-serif', category: 'Sans', preview: 'Precisa y profesional' },
  { value: 'PT Sans', family: '"PT Sans", system-ui, sans-serif', category: 'Sans', preview: 'Clásica y estable' },
  { value: 'IBM Plex Sans', family: '"IBM Plex Sans", system-ui, sans-serif', category: 'Sans', preview: 'Sólida y tecnológica' },
  { value: 'Raleway', family: 'Raleway, system-ui, sans-serif', category: 'Sans', preview: 'Ligera y elegante' },
  { value: 'Karla', family: 'Karla, system-ui, sans-serif', category: 'Sans', preview: 'Compacta y amigable' },
  { value: 'Mulish', family: 'Mulish, system-ui, sans-serif', category: 'Sans', preview: 'Suave y flexible' },
  { value: 'Crimson Text', family: '"Crimson Text", Georgia, serif', category: 'Serif', preview: 'Narrativa y humana' },
  { value: 'Fraunces', family: 'Fraunces, Georgia, serif', category: 'Serif', preview: 'Expresiva y distintiva' },
  { value: 'Alegreya', family: 'Alegreya, Georgia, serif', category: 'Serif', preview: 'Cultura y calidez' },
];

/** Fuente por defecto cuando la marca no eligió ninguna. Va incluida en el
 *  repo (`assets/fonts/`), así que el caso más común no depende de la red. */
export const DEFAULT_BRAND_FONT = 'Inter';

const BY_VALUE = new Map(GOOGLE_FONT_OPTIONS.map((f) => [f.value, f]));

/** Busca una fuente del catálogo. */
export function findGoogleFont(value: string | null | undefined): GoogleFontOption | null {
  if (!value) return null;
  return BY_VALUE.get(value.trim()) ?? null;
}

/**
 * Normaliza lo que hay guardado en el Brand Kit a una fuente del catálogo.
 *
 * Se valida contra la lista a propósito: `font_heading` también lo puede
 * rellenar el enriquecimiento por URL (`/api/brand-kit/enrich-url`), que
 * extrae lo que declare la web de la marca — puede ser una fuente de pago,
 * una local o directamente basura. Pedirle a Google una familia inventada
 * devuelve un 400, así que sólo se descargan las del catálogo.
 */
export function resolveBrandFontName(value: string | null | undefined): string {
  return findGoogleFont(value)?.value ?? DEFAULT_BRAND_FONT;
}

/** La pila CSS de la fuente, para que la preview use exactamente la misma. */
export function brandFontStack(value: string | null | undefined): string {
  return findGoogleFont(value)?.family
    ?? findGoogleFont(DEFAULT_BRAND_FONT)?.family
    ?? 'system-ui, sans-serif';
}

/**
 * Carga una familia concreta en el navegador.
 *
 * La vista previa tiene que dibujar el texto con la MISMA fuente con la que el
 * servidor lo va a escribir dentro de la imagen; si no, el usuario aprueba una
 * composición y se publica otra. El selector del Brand Kit carga las 34 del
 * catálogo para poder previsualizarlas, pero una preview sólo necesita la suya.
 */
export function ensureGoogleFontLoaded(value: string | null | undefined): void {
  if (typeof document === 'undefined') return;

  const font = findGoogleFont(value) ?? findGoogleFont(DEFAULT_BRAND_FONT);
  if (!font) return;

  const id = `kefy-font-${font.value.replace(/[^A-Za-z0-9]+/g, '-')}`;
  if (document.getElementById(id)) return;

  const family = encodeURIComponent(font.value).replace(/%20/g, '+');
  const link = document.createElement('link');
  link.id   = id;
  link.rel  = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}
