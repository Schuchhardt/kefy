// Vista de detalle de un contenido (/dashboard/content/[itemId]).
// Los estados (borrador, programado…) vienen de common.ts vía StatusBadge.
//
// locales/en/dashboard/content-detail.ts se tipa con `ContentDetailCopy`.

const es = {
  back: 'Volver a contenido',
  notFound: 'No se encontró este contenido',
  notFoundHint: 'Puede que se haya eliminado o que sea de otra marca.',
  untitled: 'Contenido sin título',
  draftNotice: 'Este contenido todavía no se publicó: puedes editarlo y publicarlo cuando esté listo.',
  edit: 'Editar',
  publish: 'Publicar o programar',
  delete: 'Eliminar',
  deleteConfirmTitle: '¿Eliminar este contenido?',
  deleteError: 'No se pudo eliminar el contenido. Inténtalo de nuevo.',
  createSimilar: 'Crear uno similar',
  publishOn: (network: string) => `Publicar también en ${network}`,
  statsTitle: 'Rendimiento',
  noStatsYet: 'Todavía no hay métricas para este contenido: pueden tardar un poco en sincronizarse tras publicar.',
  publishedOn: (date: string) => `Publicado el ${date}`,
  createdOn: (date: string) => `Creado el ${date}`,
  impressions: 'Impresiones',
  reach: 'Alcance',
  likes: 'Me gusta',
  comments: 'Comentarios',
  shares: 'Compartidos',
  engagementRate: 'Interacción',
  contentType: { post: 'Post', carousel: 'Carrusel', reel: 'Reel', story: 'Story' },
  channelGeneric: 'Todas las redes',
  autopilot: 'Piloto automático',
  createdBy: (name: string) => `por ${name}`,
  via: (label: string) => `vía ${label}`,
  origin: { ui: 'Web', chat: 'Asistente', api: 'API', mcp: 'MCP' },
};

export default es;
export type ContentDetailCopy = typeof es;
