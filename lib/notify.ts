// lib/notify.ts
// Notificaciones locales del navegador (sin push ni servidor).
//
// Generar la versión carrusel/reel/story de una pieza tarda entre medio minuto
// y un par de minutos. Con la PWA instalada la gente se va a otra app y no hay
// forma de enterarse de que terminó: al volver, la pantalla puede llevar rato
// lista o el error puede haber pasado hace un minuto.
//
// No hace falta Web Push para esto: la pestaña sigue viva con la petición en
// curso, así que al resolverse se puede disparar una notificación local. En
// Android/PWA instalada el navegador exige que la muestre el service worker
// (`registration.showNotification`), no `new Notification()`; en escritorio
// sirven las dos. Se intenta primero la del worker y se cae a la otra.
//
// iOS sólo permite notificaciones si la app está instalada en la pantalla de
// inicio (16.4+) y siempre exige un gesto del usuario para pedir el permiso:
// por eso `requestNotificationPermission()` se llama al pulsar «Generar», no
// al abrir el modal.

export interface LocalNotification {
  title: string;
  body?: string;
  /** Agrupa/reemplaza notificaciones equivalentes en vez de apilarlas. */
  tag?:  string;
  /** Ruta a abrir al tocar la notificación. */
  url?:  string;
}

export function notificationsSupported(): boolean {
  // Se comprueba el valor, no sólo la clave: hay entornos (y stubs de test)
  // donde `Notification` existe declarada pero vale `undefined`.
  return typeof window !== 'undefined' && typeof window.Notification === 'function';
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Pide permiso si aún no se decidió. Devuelve `true` si quedó concedido.
 * Debe llamarse dentro de un gesto del usuario (click), o iOS la ignora.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied')  return false;
  try {
    return (await Notification.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/** ¿La app corre instalada (standalone) en vez de en una pestaña normal? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(iosStandalone) || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

/**
 * ¿Vale la pena notificar?
 *
 * Sólo si el usuario no está mirando la pantalla: si tiene el modal delante ya
 * ve el resultado y una notificación encima sobra.
 */
export function shouldNotify(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden' || isStandalone();
}

/** Muestra una notificación local. Devuelve `true` si se llegó a mostrar. */
export async function notifyLocal(notification: LocalNotification): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;

  const options: NotificationOptions & { data?: unknown } = {
    body:  notification.body,
    tag:   notification.tag,
    icon:  '/android-chrome-192x192.png',
    badge: '/favicon-32x32.png',
    data:  { url: notification.url ?? '/' },
  };

  // La PWA instalada exige que la muestre el service worker.
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(notification.title, options);
      return true;
    } catch {
      /* sin worker activo: se intenta la vía directa */
    }
  }

  try {
    new Notification(notification.title, options);
    return true;
  } catch {
    return false;
  }
}
