const es = {
  subtitle: 'Gestiona comentarios y mensajes de todas tus plataformas',
  tabComments: 'Comentarios',
  showAll: 'Mostrando todos',
  unansweredOnly: 'Solo sin responder',
  loadingComments: 'Cargando comentarios...',
  noComments: 'Sin comentarios pendientes',
  noCommentsHint: 'Los comentarios llegan automáticamente',
  yourReply: 'Tu respuesta',
  replyBtn: '↩ Responder',
  all: 'Todos',
  replyPlaceholder: 'Escribe tu respuesta...',
  replyBtnSend: 'Responder',
  errorSend: 'Error al enviar',
  syncBtn: 'Sincronizar',
  syncing: 'Sincronizando...',
  syncDone: (n: number) => `${n} comentario${n !== 1 ? 's' : ''} sincronizado${n !== 1 ? 's' : ''}`,
  syncError: 'Error al sincronizar',
  timeNow: 'ahora',
  timeAgo: (m: number, h: number, d: number) => m < 60 ? `${m}m` : h < 24 ? `${h}h` : `${d}d`,
};

export default es;
