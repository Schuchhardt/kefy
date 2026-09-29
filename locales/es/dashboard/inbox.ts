// Conversaciones: textos de la página y de los mensajes directos. Los de
// comentarios viven en engage.ts.

const es = {
  title: 'Conversaciones',
  tabsLabel: 'Tipo de conversación',
  tabDms: 'DMs',
  unreadCount: (n: number) => (n === 1 ? '1 sin leer' : `${n} sin leer`),
  platformFilterLabel: 'Filtrar por red',
  all: 'Todas',
  timeNow: 'ahora',
  timeAgo: (m: number, h: number, d: number) => m < 60 ? `${m}m` : h < 24 ? `${h}h` : `${d}d`,
  unreadOnly: 'Solo no leídos',
  unread: 'Sin leer',
  loading: 'Cargando…',
  threadListLabel: 'Mensajes directos',
  noMessages: 'Sin mensajes por ahora',
  noMessagesHint: 'En cuanto alguien te escriba por privado en una red conectada, la conversación aparece aquí.',
  noUnread: 'Estás al día',
  noUnreadHint: 'No tienes mensajes sin leer.',
  selectMessage: 'Selecciona una conversación para verla',
  backToList: 'Volver a las conversaciones',
  loadingConvo: 'Cargando conversación…',
  errorSend: 'Error al enviar',
  errorConn: 'Error de conexión',
  replyLabel: 'Tu respuesta',
  replyPlaceholder: 'Escribe una respuesta…',
  sendBtn: 'Enviar',
  syncBtn: 'Sincronizar',
  syncing: 'Sincronizando…',
  syncDone: (n: number) => `${n} conversación${n !== 1 ? 'es' : ''} sincronizada${n !== 1 ? 's' : ''}`,
  syncError: 'Error al sincronizar',
};

export default es;
export type InboxCopy = typeof es;
