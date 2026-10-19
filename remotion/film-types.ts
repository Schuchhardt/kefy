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
  | { type: 'video'; src: string; clip_seconds: number; has_audio: boolean }
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

export interface FilmCompositionProps {
  scenes:       FilmScene[];
  brandName?:   string;
  accentColor?: string;
  fontHeading?: string;
  logoUrl?:     string;
  /** Archivo bajo remotion/public/audio/music/. */
  musicTrack?:  string;
  /** Subtítulos quemados de la voz (por defecto, sí). */
  captions?:    boolean;
}
