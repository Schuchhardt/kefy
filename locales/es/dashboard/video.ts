// Producción de video (lib/video): el plan de herramientas de un guion y su
// progreso. Lo usan VideoPlanPanel y MuxReelPlayer.

const es = {
  plan: {
    title: 'Plan de producción',
    intro: 'Este guion se produce en la nube con estas herramientas. Revisa el costo antes de producirlo.',
    loading: 'Calculando el plan…',
    loadError: 'No se pudo cargar el plan del video.',
    shots: (n: number) => `${n} ${n === 1 ? 'plano' : 'planos'}`,
    duration: (s: number) => `~${s} s`,
    characters: (names: string) => `Personajes: ${names}`,
    motionLabel: 'Animación',
    motion: {
      none: 'Sin animación — fotos con movimiento de cámara',
      key:  'Planos clave — el hook y hasta 3 planos animados',
      full: 'Todos los planos animados',
    },
    toolCount: (label: string, n: number) => `${label} ×${n}`,
    credits: (n: number) => `${n} créditos`,
    total: (n: number) => `Total: ${n} créditos`,
    remaining: (n: number) => `Te quedan ${n} este mes`,
    notEnough: 'No te alcanzan los créditos de este mes: prueba con menos animación.',
    stepsToggle: (n: number) => `Ver los ${n} pasos`,
    general: 'General',
    shot: (n: number) => `Plano ${n}`,
    fallback: 'Si un paso falla, ese plano usa un respaldo (foto en vez de clip) y el video sale igual. Los créditos de un paso fallido se devuelven.',
    produce: (n: number) => `Producir video · ${n} créditos`,
  },
  progress: {
    tools: {
      generate_image: 'Imagen',
      text_to_speech: 'Voz',
      animate_image:  'Animación',
      lip_sync:       'Lipsync',
      compose_video:  'Montaje',
    },
    shot: (n: number) => `plano ${n}`,
    title: 'Produciendo el video',
    stepsDone: (done: number, total: number) => `${done} de ${total} pasos`,
    status: {
      pending: 'En cola',
      running: 'En curso',
      done:    'Listo',
      failed:  'Falló',
      skipped: 'Omitido',
    },
    composing: 'Montando el video final…',
    slow: 'Las animaciones tardan unos minutos. Puedes cerrar esta página: el video se sigue produciendo.',
  },
};

export default es;
export type VideoCopy = typeof es;
