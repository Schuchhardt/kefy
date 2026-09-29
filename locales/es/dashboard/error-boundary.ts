// Pantalla de error de una sección del dashboard (app/[lang]/dashboard/error.tsx).
//
// locales/en/dashboard/error-boundary.ts se tipa con `ErrorBoundaryCopy`.

const es = {
  title: 'Esta sección falló',
  body: 'El error ya quedó registrado. Reintenta o ve a otra sección del dashboard.',
  retry: 'Reintentar',
  home: 'Ir al inicio',
  reference: (id: string) => `Referencia del error: ${id}`,
};

export default es;
export type ErrorBoundaryCopy = typeof es;
