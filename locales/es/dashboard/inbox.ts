const es = {
  all: 'Todos',
  timeNow: 'ahora',
  timeAgo: (m: number, h: number, d: number) => m < 60 ? `${m}m` : h < 24 ? `${h}h` : `${d}d`,
  unreadOnly: 'Solo no leídos',
  loading: 'Cargando...',
  noMessages: 'Sin mensajes',
  noMessagesHint: 'Los DMs llegan aquí vía webhook de Zernio',
  selectMessage: 'Selecciona un mensaje para verlo',
  loadingConvo: 'Cargando conversación...',
  errorSend: 'Error al enviar',
  errorConn: 'Error de conexión',
  replyPlaceholder: 'Escribe una respuesta...',
  sendBtn: '↑ Enviar',
  syncBtn: 'Sincronizar',
  syncing: 'Sincronizando...',
  syncDone: (n: number) => `${n} conversación${n !== 1 ? 'es' : ''} sincronizada${n !== 1 ? 's' : ''}`,
  syncError: 'Error al sincronizar',
};

export default es;
