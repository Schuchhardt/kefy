import { Composition, registerRoot } from 'remotion';
import { ReelComposition, getTotalFrames, calculateReelMetadata, type ReelCompositionProps } from './ReelComposition';
import { FilmComposition, calculateFilmMetadata, getFilmTotalFrames } from './FilmComposition';
import type { FilmCompositionProps, FilmTheme } from './film-types';

// Sample scenes for Remotion Studio preview
const SAMPLE_SCENES: ReelCompositionProps['scenes'] = [
  { scene_order: 1, title: '¿Por qué tu marca necesita esto?', body: 'La respuesta cambiará cómo haces contenido.', duration_seconds: 3 },
  { scene_order: 2, title: 'El problema real',     body: 'Publicar sin estrategia es perder tiempo y dinero.', duration_seconds: 4 },
  { scene_order: 3, title: 'La solución existe',   body: 'Genera, programa y publica con un solo clic.', duration_seconds: 3 },
  { scene_order: 4, title: 'Resultados reales',    body: '10x más contenido en la mitad del tiempo.', duration_seconds: 3 },
  { scene_order: 5, title: 'Empieza hoy',          body: 'Kefy · IA para tu marca social', duration_seconds: 4 },
];

const SAMPLE_FPS = 30;

// Muestra del pipeline de video (lib/video): sin URLs, cae al fondo de marca.
// El tema es el que resolveFilmTheme arma para Kefy (lib/video/brand.ts).
const SAMPLE_THEME: FilmTheme = {
  accent: '#c6ff4b', onAccent: '#0b0b0f', primary: '#14141c', secondary: '#2a2440', onPrimary: '#ffffff',
  headingFont: 'Montserrat', bodyFont: 'Montserrat', brandName: 'Kefy', tagline: 'IA para tu marca social',
  contact: 'kefy.app', branded: true,
};
const SAMPLE_FILM: FilmCompositionProps['scenes'] = [
  {
    id: 's1', duration_seconds: 3, visual: { type: 'none' }, camera: 'push_in', voice: null, speech_offset: 0.2,
    words: [
      { text: '¿Tu', start: 0, end: 0.3 }, { text: 'marca', start: 0.3, end: 0.7 },
      { text: 'publica', start: 0.7, end: 1.1 }, { text: 'sin', start: 1.1, end: 1.3 }, { text: 'plan?', start: 1.3, end: 1.8 },
    ],
    on_screen_text: '3 errores', transition: 'cut',
  },
  {
    id: 's2', duration_seconds: 3, visual: { type: 'none' }, camera: 'pan_left', voice: null, speech_offset: 0.2,
    words: [{ text: 'Kefy', start: 0, end: 0.4 }, { text: 'lo', start: 0.4, end: 0.6 }, { text: 'resuelve.', start: 0.6, end: 1.2 }],
    on_screen_text: null, transition: 'zoom',
  },
];

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KefyReel"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={ReelComposition as any}
        // Only the Studio default — every render recomputes it from the real
        // scenes via calculateMetadata below.
        durationInFrames={getTotalFrames(SAMPLE_SCENES, SAMPLE_FPS)}
        calculateMetadata={({ props }) => calculateReelMetadata({ props }, SAMPLE_FPS)}
        fps={SAMPLE_FPS}
        width={1080}
        height={1920}
        defaultProps={{
          scenes:      SAMPLE_SCENES,
          brandName:   'Kefy',
          accentColor: '#c6ff4b',
        }}
      />
      <Composition
        id="KefyFilm"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={FilmComposition as any}
        durationInFrames={getFilmTotalFrames(SAMPLE_FILM, SAMPLE_FPS, { duration_seconds: 2.2 })}
        calculateMetadata={({ props }) => calculateFilmMetadata({ props: props as Partial<FilmCompositionProps> }, SAMPLE_FPS)}
        fps={SAMPLE_FPS}
        width={1080}
        height={1920}
        defaultProps={{ scenes: SAMPLE_FILM, theme: SAMPLE_THEME, outro: { duration_seconds: 2.2, headline: null } }}
      />
    </>
  );
};

registerRoot(RemotionRoot);
