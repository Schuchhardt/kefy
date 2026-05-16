import { Composition } from 'remotion';
import { ReelComposition, getTotalFrames, type ReelCompositionProps } from './ReelComposition';

// Sample scenes for Remotion Studio preview
const SAMPLE_SCENES: ReelCompositionProps['scenes'] = [
  { scene_order: 1, title: '¿Por qué tu marca necesita esto?', body: 'La respuesta cambiará cómo haces contenido.', duration_seconds: 3 },
  { scene_order: 2, title: 'El problema real',     body: 'Publicar sin estrategia es perder tiempo y dinero.', duration_seconds: 4 },
  { scene_order: 3, title: 'La solución existe',   body: 'Genera, programa y publica con un solo clic.', duration_seconds: 3 },
  { scene_order: 4, title: 'Resultados reales',    body: '10x más contenido en la mitad del tiempo.', duration_seconds: 3 },
  { scene_order: 5, title: 'Empieza hoy',          body: 'Kefy · IA para tu marca social', duration_seconds: 4 },
];

const SAMPLE_FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KefyReel"
        component={ReelComposition}
        durationInFrames={getTotalFrames(SAMPLE_SCENES, SAMPLE_FPS)}
        fps={SAMPLE_FPS}
        width={1080}
        height={1920}
        defaultProps={{
          scenes:      SAMPLE_SCENES,
          brandName:   'Kefy',
          accentColor: '#c6ff4b',
        }}
      />
    </>
  );
};
