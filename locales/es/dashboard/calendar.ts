// Calendario de publicaciones (/dashboard/content/calendar). Los estados
// (programado, publicado…) vienen de common.ts vía StatusBadge.
//
// locales/en/dashboard/calendar.ts se tipa con `CalendarCopy`.

const es = {
  title: 'Calendario',
  subtitle: 'Programa y gestiona tus publicaciones en redes sociales',
  monthNames: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] as string[],
  dayNames: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as string[],
  today: 'Hoy',
  prevMonth: 'Mes anterior',
  nextMonth: 'Mes siguiente',
  selectDayHint: 'Elige un día para ver sus publicaciones o programar algo nuevo.',
  scheduleBtn: 'Programar',

  accountsLabel: 'Cuentas conectadas',
  accountStatus: { active: 'Activa', expired: 'Caducada', revoked: 'Revocada' } as Record<string, string>,
  noAccounts: 'Sin cuentas conectadas.',
  noAccountsHint: 'Conecta tus redes para poder publicar y programar.',
  noAccountsLink: 'Conectar cuentas',

  legendLabel: 'Leyenda de estados',
  dayLabel: (date: string, count: number) => (count === 0
    ? `${date}, sin publicaciones`
    : count === 1 ? `${date}, 1 publicación` : `${date}, ${count} publicaciones`),
  morePosts: (n: number) => `+${n}`,
  scheduleOnDay: 'Programar este día',

  emptyDayTitle: 'No hay nada programado este día',
  emptyDayHint: 'Crea una pieza nueva o programa una que ya tengas.',
  emptyPastDayHint: 'Este día ya pasó: lo que programes saldrá a partir de ahora.',
  createContent: 'Crear contenido',
  scheduleExisting: 'Programar un contenido existente',

  agendaLabel: (month: string) => `Agenda de ${month.toLowerCase()}`,
  agendaEmpty: (month: string) => `Nada programado en ${month.toLowerCase()}`,
  agendaEmptyHint: 'Programa una publicación o crea contenido nuevo.',

  loadError: 'No se pudo cargar el calendario.',
  retry: 'Reintentar',
  noText: '(sin texto)',
  unknownAccount: 'Cuenta desconocida',
  cancelPost: 'Cancelar publicación',
  cancelConfirmTitle: '¿Cancelar esta publicación programada?',
  cancelConfirmMessage: 'No se publicará. El contenido sigue en tu biblioteca y puedes volver a programarlo.',
  cancelKeep: 'Mantener',
  cancelError: 'No se pudo cancelar la publicación. Inténtalo de nuevo.',
};

export default es;
export type CalendarCopy = typeof es;
