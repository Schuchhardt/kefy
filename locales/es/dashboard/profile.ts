// Mi perfil (app/[lang]/dashboard/profile/page.tsx). Es el único sitio donde
// se edita el nombre de la persona: Ajustes solo lo muestra y enlaza aquí.
//
// Los errores de PATCH /api/auth/me llegan en español desde el servidor; la
// página muestra la copy de aquí según el status.
//
// locales/en/dashboard/profile.ts se tipa con `ProfileCopy`.

const es = {
  /** Locale BCP 47 para las fechas. */
  dateLocale: 'es-ES',
  title: 'Mi perfil',
  subtitle: 'Tu información personal y tu contraseña',
  sectionInfo: 'Información personal',
  sectionPassword: 'Contraseña',
  sectionOrg: 'Organización',
  nameLabel: 'Nombre',
  namePlaceholder: 'Tu nombre',
  emailLabel: 'Correo electrónico',
  emailNote: 'El correo no se puede cambiar.',
  joined: (date: string) => `Miembro desde el ${date}`,
  saveProfile: 'Guardar cambios',
  saved: 'Cambios guardados',
  saveError: 'No se pudieron guardar los cambios. Inténtalo de nuevo.',
  // Contraseña
  currentPassword: 'Contraseña actual',
  newPassword: 'Nueva contraseña',
  newPasswordHint: 'Mínimo 8 caracteres.',
  confirmPassword: 'Confirmar nueva contraseña',
  changePassword: 'Cambiar contraseña',
  passwordChanged: 'Contraseña actualizada',
  passwordMismatch: 'Las contraseñas no coinciden.',
  passwordWrong: 'La contraseña actual no es correcta.',
  passwordError: 'No se pudo cambiar la contraseña. Inténtalo de nuevo.',
  // Organización
  orgLabel: 'Organización',
  roleLabel: 'Tu rol',
  planLabel: 'Plan',
  orgManage: 'Gestionar en Ajustes',
  roles: { owner: 'Dueño', admin: 'Administrador', member: 'Miembro' } as Record<string, string>,
};

export default es;
export type ProfileCopy = typeof es;
