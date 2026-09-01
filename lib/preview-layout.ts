// lib/preview-layout.ts
// Geometría compartida entre la vista previa (HTML) y el "baking" del texto
// dentro de la imagen (sharp/SVG).
//
// Por qué está separado de `image-fit.ts`: ahí vive *cómo se recorta* la imagen
// para cada red; acá vive *dónde se puede poner texto encima sin que la propia
// interfaz de la red lo tape*. Son preguntas distintas y ambas tienen que dar
// la misma respuesta en el preview y en el servidor — si no, lo que el usuario
// aprueba en pantalla no es lo que termina publicado.
//
// Módulo puro (sin sharp, sin React) para que lo puedan importar los dos lados.

import type { ContentChannel } from '@/types/ai';
import type { ContentType } from '@/types/content';

// ─── Marco de la red ─────────────────────────────────────────────────────────

/** Cómo se acomoda la imagen dentro del marco que muestra la red. */
export type FrameFit = 'cover' | 'contain';

export interface NetworkFrame {
  /** Relación ancho/alto del área donde la red muestra el contenido. */
  aspect: number;
  /** El mismo valor listo para `aspect-ratio` en CSS ('1 / 1', '9 / 16'). */
  css:    string;
  /** `cover` cuando la red recorta a ese marco; `contain` cuando lo encaja. */
  fit:    FrameFit;
}

const SQUARE   = 1;
const VERTICAL = 9 / 16;

/**
 * El marco real en el que la red muestra la pieza.
 *
 * Reels y stories son verticales en todas partes. TikTok además es vertical
 * para *todo*, incluidos los carruseles de fotos: una imagen cuadrada no se
 * recorta (entra dentro del rango que acepta) pero se muestra encajada en un
 * viewport 9:16, con la UI de la app encima. Mostrar ese carrusel en un marco
 * cuadrado como el de Instagram era mentirle al usuario sobre el resultado.
 */
export function networkFrame(platform: ContentChannel, format: ContentType): NetworkFrame {
  if (format === 'reel' || format === 'story') {
    return { aspect: VERTICAL, css: '9 / 16', fit: 'cover' };
  }
  if (platform === 'tiktok') {
    // El post/carrusel cuadrado se sube tal cual y TikTok lo encaja vertical.
    return { aspect: VERTICAL, css: '9 / 16', fit: 'contain' };
  }
  return { aspect: SQUARE, css: '1 / 1', fit: 'cover' };
}

// ─── Zona segura ─────────────────────────────────────────────────────────────

/** Márgenes libres de texto, como fracción del lado correspondiente (0–1). */
export interface SafeArea {
  top:    number;
  right:  number;
  bottom: number;
  left:   number;
}

/** Margen tipográfico mínimo cuando la red no dibuja nada encima del medio. */
const BASE_PADDING = 0.055;

const FEED_SAFE: SafeArea = {
  top: BASE_PADDING, right: BASE_PADDING, bottom: BASE_PADDING, left: BASE_PADDING,
};

/**
 * TikTok dibuja su interfaz **encima** del contenido:
 *  - columna derecha: avatar, corazón, comentarios, compartir, disco de audio;
 *  - franja inferior: @usuario, descripción y el nombre de la canción;
 *  - franja superior: buscador y las pestañas "Siguiendo / Para ti".
 * Todo texto que caiga ahí queda tapado, así que se reserva el espacio.
 */
const TIKTOK_SAFE: SafeArea = { top: 0.11, right: 0.22, bottom: 0.24, left: 0.05 };

/** Instagram/Facebook: barra de progreso + cabecera arriba, caja de respuesta abajo. */
const STORY_SAFE: SafeArea = { top: 0.13, right: 0.06, bottom: 0.17, left: 0.06 };

/** Reels de Instagram/Facebook: rail de acciones a la derecha, caption abajo. */
const REEL_SAFE: SafeArea = { top: 0.10, right: 0.18, bottom: 0.20, left: 0.05 };

/**
 * Zona donde se puede escribir sin que la interfaz de la red tape el texto.
 * La usan el overlay HTML del preview y el compositor del servidor, para que
 * el texto caiga exactamente en el mismo lugar en los dos.
 */
export function safeAreaFor(platform: ContentChannel, format: ContentType): SafeArea {
  if (platform === 'tiktok') return TIKTOK_SAFE;
  if (format === 'story')    return STORY_SAFE;
  if (format === 'reel')     return REEL_SAFE;
  return FEED_SAFE;
}

/** La zona segura expresada en píxeles para un lienzo concreto. */
export interface SafeBox {
  x:      number;
  y:      number;
  width:  number;
  height: number;
}

export function safeBoxFor(
  canvasWidth:  number,
  canvasHeight: number,
  platform:     ContentChannel,
  format:       ContentType,
): SafeBox {
  const safe = safeAreaFor(platform, format);
  const x = Math.round(canvasWidth  * safe.left);
  const y = Math.round(canvasHeight * safe.top);
  return {
    x,
    y,
    width:  Math.max(1, Math.round(canvasWidth  * (1 - safe.left - safe.right))),
    height: Math.max(1, Math.round(canvasHeight * (1 - safe.top  - safe.bottom))),
  };
}

/** La zona segura como `padding` CSS, para el overlay del preview. */
export function safeAreaCss(platform: ContentChannel, format: ContentType): {
  paddingTop: string; paddingRight: string; paddingBottom: string; paddingLeft: string;
} {
  const safe = safeAreaFor(platform, format);
  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  return {
    paddingTop:    pct(safe.top),
    paddingRight:  pct(safe.right),
    paddingBottom: pct(safe.bottom),
    paddingLeft:   pct(safe.left),
  };
}
