const es = {
  subtitle: 'Gestiona comentarios y reseñas de todas tus plataformas',
  tabComments: 'Comentarios',
  tabReviews: 'Reseñas',
  showAll: 'Mostrando todos',
  unansweredOnly: 'Solo sin responder',
  loadingComments: 'Cargando comentarios...',
  noComments: 'Sin comentarios pendientes',
  noCommentsHint: 'Los comentarios llegan automáticamente vía Zernio webhooks',
  yourReply: 'Tu respuesta',
  replyBtn: '↩ Responder',
  loadingReviews: 'Cargando reseñas...',
  noReviews: 'Sin reseñas pendientes',
  noReviewsHint: 'Las reseñas llegan automáticamente vía Zernio webhooks',
  all: 'Todos',
  replyPlaceholder: 'Escribe tu respuesta...',
  replyBtnSend: 'Responder',
  errorSend: 'Error al enviar',
  timeNow: 'ahora',
  timeAgo: (m: number, h: number, d: number) => m < 60 ? `${m}m` : h < 24 ? `${h}h` : `${d}d`,
};

export default es;
