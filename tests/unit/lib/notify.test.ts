import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isStandalone,
  notificationPermission,
  notificationsSupported,
  notifyLocal,
  requestNotificationPermission,
  shouldNotify,
} from '@/lib/notify';
import { buildServiceWorkerSource } from '@/lib/service-worker';

// Regresión: con la PWA instalada no había forma de enterarse de que la
// generación había terminado. La petición tarda minutos, la gente se va a otra
// app y al volver no sabía si estaba lista, si había fallado o si seguía.

class FakeNotification {
  static permission: NotificationPermission = 'default';
  static requestPermission = vi.fn(async () => FakeNotification.permission);
  static instances: Array<{ title: string; options?: NotificationOptions }> = [];
  constructor(title: string, options?: NotificationOptions) {
    FakeNotification.instances.push({ title, options });
  }
}

function installNotificationApi(permission: NotificationPermission) {
  FakeNotification.permission = permission;
  FakeNotification.instances = [];
  FakeNotification.requestPermission = vi.fn(async () => FakeNotification.permission);
  vi.stubGlobal('Notification', FakeNotification as unknown as typeof Notification);
}

beforeEach(() => {
  installNotificationApi('default');
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('soporte y permisos', () => {
  it('detecta que el navegador soporta notificaciones', () => {
    expect(notificationsSupported()).toBe(true);
    expect(notificationPermission()).toBe('default');
  });

  it('pide permiso una sola vez y devuelve si quedó concedido', async () => {
    installNotificationApi('default');
    FakeNotification.requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('con el permiso ya concedido no vuelve a molestar al usuario', async () => {
    installNotificationApi('granted');
    await expect(requestNotificationPermission()).resolves.toBe(true);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('si el usuario lo denegó, no se le vuelve a preguntar', async () => {
    installNotificationApi('denied');
    await expect(requestNotificationPermission()).resolves.toBe(false);
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
  });

  it('en un navegador sin la API no rompe nada', async () => {
    vi.stubGlobal('Notification', undefined);
    expect(notificationsSupported()).toBe(false);
    expect(notificationPermission()).toBe('unsupported');
    await expect(requestNotificationPermission()).resolves.toBe(false);
    await expect(notifyLocal({ title: 'x' })).resolves.toBe(false);
  });
});

describe('shouldNotify', () => {
  it('no interrumpe si el usuario está mirando la pantalla', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(shouldNotify()).toBe(false);
  });

  it('avisa si la pestaña está en segundo plano', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    expect(shouldNotify()).toBe(true);
  });

  it('avisa siempre con la PWA instalada, que es el caso reportado', () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('standalone') }));
    expect(isStandalone()).toBe(true);
    expect(shouldNotify()).toBe(true);
  });
});

describe('notifyLocal', () => {
  it('sin permiso concedido no muestra nada', async () => {
    installNotificationApi('default');
    await expect(notifyLocal({ title: 'Listo' })).resolves.toBe(false);
    expect(FakeNotification.instances).toHaveLength(0);
  });

  // Android y la PWA instalada rechazan `new Notification()`: exigen que la
  // muestre el service worker.
  it('prefiere el service worker cuando hay uno activo', async () => {
    installNotificationApi('granted');
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ showNotification }) } });

    await expect(notifyLocal({ title: 'Tu carrusel está listo', body: 'Ábrelo', url: '/es/dashboard/content' })).resolves.toBe(true);

    expect(showNotification).toHaveBeenCalledWith('Tu carrusel está listo', expect.objectContaining({
      body: 'Ábrelo',
      data: { url: '/es/dashboard/content' },
    }));
    expect(FakeNotification.instances).toHaveLength(0);
  });

  it('sin service worker cae en la notificación directa', async () => {
    installNotificationApi('granted');
    vi.stubGlobal('navigator', {});
    await expect(notifyLocal({ title: 'Listo' })).resolves.toBe(true);
    expect(FakeNotification.instances[0].title).toBe('Listo');
  });

  it('si el worker falla, igual se intenta la vía directa', async () => {
    installNotificationApi('granted');
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.reject(new Error('no worker')) } });
    await expect(notifyLocal({ title: 'Listo' })).resolves.toBe(true);
    expect(FakeNotification.instances).toHaveLength(1);
  });

  it('agrupa por tag para no apilar avisos del mismo contenido', async () => {
    installNotificationApi('granted');
    const showNotification = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { serviceWorker: { ready: Promise.resolve({ showNotification }) } });
    await notifyLocal({ title: 'x', tag: 'rendition-item-1-carousel' });
    expect(showNotification.mock.calls[0][1].tag).toBe('rendition-item-1-carousel');
  });
});

describe('service worker', () => {
  const source = buildServiceWorkerSource('test-version');

  it('maneja el toque sobre la notificación', () => {
    expect(source).toContain("addEventListener('notificationclick'");
    expect(source).toContain('event.notification.close()');
  });

  it('enfoca la pestaña abierta en vez de abrir otra', () => {
    expect(source).toContain('matchAll');
    expect(source).toContain('client.focus()');
    expect(source).toContain('openWindow');
  });

  it('usa la URL que viaja en los datos de la notificación', () => {
    expect(source).toContain('event.notification.data');
  });
});
