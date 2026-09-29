// Panel de cuentas sociales (components/dashboard/SocialConnectionPanel.tsx):
// se usa en Ajustes → Cuentas sociales y en el onboarding del inicio.
//
// locales/en/dashboard/social.ts se tipa con `SocialCopy`.

const es = {
  /** Locale BCP 47 para las fechas del panel. */
  dateLocale: 'es-ES',
  connectError: 'No se pudo conectar la cuenta. Inténtalo de nuevo.',
  connectedOk: (network: string) => `${network} conectado correctamente`,
  connected: 'Conectadas',
  connectNew: 'Conectar nueva',
  /** Nombre accesible del botón de cada red. */
  connectAria: (network: string) => `Conectar ${network}`,
  connectAgainAria: (network: string) => `Conectar otra cuenta de ${network}`,
  redirecting: 'Redirigiendo…',
  disconnect: 'Desconectar',
  disconnectAria: (account: string, network: string) => `Desconectar ${account} (${network})`,
  confirmDisconnectTitle: (account: string) => `¿Desconectar ${account}?`,
  confirmDisconnectBody: 'Las reglas de piloto automático que la usen dejarán de funcionar. Puedes volver a conectarla cuando quieras.',
  confirmDisconnect: 'Sí, desconectar',
  cancel: 'Cancelar',
  disconnectError: 'No se pudo desconectar la cuenta. Inténtalo de nuevo.',
  disconnectForbidden: 'Solo el dueño o un administrador pueden desconectar cuentas.',
  expires: (date: string) => `expira el ${date}`,
  accountStatus: {
    active: 'Activa',
    expired: 'Expirada',
    revoked: 'Revocada',
  } as Record<string, string>,
  connectTitle: 'Conecta tus redes sociales',
  connectDesc: 'Conecta al menos una cuenta para empezar a publicar desde Kefy.',
  ctaTitle: 'Perfecto, ahora crea tu primer contenido',
  ctaDesc: 'Tu red social ya está conectada y lista para publicar.',
  ctaButton: 'Crear primer contenido',
  xSensitiveHint: 'Si tus imágenes salen en X detrás de un aviso de contenido sensible, desmarca «Marcar el contenido multimedia que publicas como material que puede ser sensible» en X → Configuración y privacidad → Privacidad y seguridad → Tus publicaciones. Es un ajuste de tu cuenta de X; Kefy no puede cambiarlo al publicar.',
  xSensitiveLink: 'Abrir ajustes de X',
  autoConnecting: (network: string) => `Conectando ${network}…`,
  autoConnectUnknownPlatform: 'El enlace de conexión apunta a una red que Kefy no admite. Elige una de la lista.',
  autoConnectBrandNotFound: 'La marca del enlace no está entre tus marcas, así que no se conectó ninguna cuenta.',
  autoConnectBrandSwitchError: 'No se pudo cambiar a la marca del enlace. Inténtalo de nuevo.',
};

export default es;
export type SocialCopy = typeof es;
