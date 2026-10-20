// Props de la composición KefyFilm. Viven aparte (sin imports) para que las
// compartan el bundle de Remotion y lib/video/timeline.ts, que las arma.

export type FilmCameraMove = 'push_in' | 'pull_out' | 'pan_left' | 'pan_right' | 'static';
export type FilmTransition = 'crossfade' | 'cut' | 'zoom' | 'slide';

export interface FilmWord {
  text:  string;
  /** Segundos desde que empieza a hablar (ver `speech_offset`). */
  start: number;
  end:   number;
}

export type FilmVisual =
  | {
      type: 'video'; src: string; clip_seconds: number; has_audio: boolean;
      /** Foto del plano: va debajo del clip y lo cubre si termina antes. */
      poster?: string | null;
    }
  | { type: 'image'; src: string }
  | { type: 'none' };

export interface FilmScene {
  id:               string;
  duration_seconds: number;
  visual:           FilmVisual;
  camera:           FilmCameraMove;
  /** Voz aparte del clip. null si el plano no habla o si el clip ya trae la voz (lipsync). */
  voice:            { src: string } | null;
  /** Segundo del plano en que empieza a hablar (voz aparte o audio del clip). */
  speech_offset:    number;
  words:            FilmWord[];
  on_screen_text:   string | null;
  transition:       FilmTransition;
}

/**
 * Diseño de marca ya resuelto (lib/video/brand.ts::resolveFilmTheme): colores
 * válidos con su texto legible encima, tipografías del catálogo de Google
 * Fonts y los datos del cierre. Nunca trae huecos: lo que la marca no definió
 * llega con el respaldo.
 */
export interface FilmTheme {
  accent:      string;
  /** Texto legible sobre `accent` (tinta o blanco). */
  onAccent:    string;
  /** Fondo oscuro de marca: planos sin imagen y tarjeta de cierre. */
  primary:     string;
  secondary:   string;
  onPrimary:   string;
  headingFont: string;
  bodyFont:    string;
  brandName?:  string;
  logoUrl?:    string;
  tagline?:    string;
  /** Web o @usuario para el cierre. */
  contact?:    string;
  /** false: la marca no definió nada y todo es respaldo. */
  branded:     boolean;
}

/** Tarjeta de cierre con el logo (o el nombre), el tagline y el contacto. */
export interface FilmOutro {
  duration_seconds: number;
  /** Llamado a la acción corto, si el guion lo trae. */
  headline?:        string | null;
}

export interface FilmCompositionProps {
  scenes:       FilmScene[];
  theme:        FilmTheme;
  outro?:       FilmOutro | null;
  /** Archivo bajo remotion/public/audio/music/. */
  musicTrack?:  string;
  /** Subtítulos quemados de la voz (por defecto, sí). */
  captions?:    boolean;
}
