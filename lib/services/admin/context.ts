// Contexto de un servicio de administración de la plataforma. A diferencia de
// ServiceContext no hay organización ni marca: el admin ve todas. Cada
// servicio filtra por el org_id que recibe en su input.

export interface AdminContext {
  adminUserId: string;
  /** En minúsculas; queda en la auditoría y en las notas y actividades. */
  adminEmail: string;
  /** Conexión OAuth con la que llegó la petición. */
  apiKeyId?: string;
  /** Reloj de la petición (los tests lo fijan). */
  now: Date;
}
