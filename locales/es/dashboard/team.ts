// Equipo de la organización (components/dashboard/TeamPanel.tsx), en
// Ajustes → Equipo.
//
// Los errores de /api/team/** llegan en español desde el servidor; el panel no
// los muestra tal cual, sino la copy de aquí según el status, para que la
// interfaz en inglés no mezcle idiomas.
//
// locales/en/dashboard/team.ts se tipa con `TeamCopy`.

const es = {
  seats: (used: number, limit: number) => `${used} de ${limit} ${limit === 1 ? 'lugar usado' : 'lugares usados'}`,
  membersLabel: 'Miembros del equipo',
  you: 'tú',
  roleMember: 'Miembro',
  roleAdmin: 'Administrador',
  roleOwner: 'Dueño',
  // Invitar
  inviteTitle: 'Invitar a alguien',
  emailLabel: 'Correo electrónico',
  emailPlaceholder: 'correo@ejemplo.com',
  roleLabel: 'Rol',
  invite: 'Invitar',
  inviting: 'Enviando…',
  invited: (email: string) => `Invitación enviada a ${email}.`,
  sentNoEmail: 'Invitación creada, pero no se pudo enviar el correo. Reenvíala más tarde.',
  inviteError: 'No se pudo enviar la invitación. Inténtalo de nuevo.',
  invalidEmail: 'Escribe un correo electrónico válido.',
  alreadyMember: 'Esa persona ya es parte de tu equipo.',
  planFull: 'Tu plan no admite más miembros. Mejora de plan para invitar a alguien más.',
  seePlans: 'Ver planes',
  onlyManagers: 'Solo el dueño o un administrador pueden gestionar el equipo.',
  // Pendientes
  pending: 'Invitaciones pendientes',
  emptyPending: 'No hay invitaciones pendientes.',
  expired: 'expirada',
  revoke: 'Revocar',
  revokeAria: (email: string) => `Revocar la invitación a ${email}`,
  revokeError: 'No se pudo revocar la invitación. Inténtalo de nuevo.',
  // Eliminar
  remove: 'Eliminar',
  removeAria: (name: string) => `Eliminar a ${name} del equipo`,
  confirmRemove: (name: string) => `¿Eliminar a ${name} del equipo?`,
  confirmRemoveBody: 'Perderá el acceso a la organización de inmediato. Puedes volver a invitar a esta persona más tarde.',
  cancel: 'Cancelar',
  removeError: 'No se pudo eliminar al miembro. Inténtalo de nuevo.',
  removeOnlyOwner: 'Solo el dueño puede eliminar a un administrador.',
  // Carga
  loading: 'Cargando equipo…',
  loadError: 'No pudimos cargar el equipo.',
  retry: 'Reintentar',
};

export default es;
export type TeamCopy = typeof es;
