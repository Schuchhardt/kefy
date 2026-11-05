import { describe, it, expect } from 'vitest';
import {
  defaultScheduleValue, displayTitle, hashtagsText, parseHashtags, percent, pickLang, regeneratePrompt, scheduleIso,
} from '@/mcp-app/src/format';

describe('format', () => {
  it('pickLang: el locale del host manda', () => {
    expect(pickLang('es-CL', 'en')).toBe('es');
    expect(pickLang('en-US', 'es')).toBe('en');
    expect(pickLang('pt-BR', 'en')).toBe('en');
    expect(pickLang(undefined, undefined)).toBe('es');
  });

  it('hashtags: sin #, sin repetidos, máx. 30', () => {
    expect(parseHashtags('#a, b  #c ##a')).toEqual(['a', 'b', 'c']);
    expect(parseHashtags(Array.from({ length: 40 }, (_, i) => `t${i}`).join(' '))).toHaveLength(30);
    expect(hashtagsText(['a', '#b'])).toBe('#a #b');
  });

  it('regeneratePrompt: instrucción + tema + conservar la referencia, ≤ 1000', () => {
    const p = regeneratePrompt('más cálida', 'Lanzamiento de otoño', true);
    expect(p).toMatch(/^más cálida\. Subject: Lanzamiento de otoño\. Keep the subject/);
    expect(regeneratePrompt('x'.repeat(2000), null, false)).toHaveLength(1000);
  });

  it('scheduleIso: ISO con zona y al menos 5 minutos adelante', () => {
    const now = new Date('2026-11-04T12:00:00Z').getTime();
    const later = new Date(now + 60 * 60_000);
    const local = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    expect(scheduleIso(local(later), now)).toBe(later.toISOString());
    expect(scheduleIso(local(new Date(now + 60_000)), now)).toBeNull();
    expect(scheduleIso('', now)).toBeNull();
    expect(defaultScheduleValue(new Date(now))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:(00|15|30|45)$/);
  });

  it('percent y displayTitle', () => {
    expect(percent(0.456)).toBe(46);
    expect(percent(7)).toBe(100);
    expect(displayTitle(null, 'a'.repeat(80), 'X')).toHaveLength(61);
    expect(displayTitle('  ', '', 'Sin título')).toBe('Sin título');
  });
});

describe('host', () => {
  it('openLink solo abre http(s)', async () => {
    const { isWebUrl } = await import('@/mcp-app/src/host');
    expect(isWebUrl('https://instagram.com/p/1')).toBe(true);
    expect(isWebUrl('javascript:alert(1)')).toBe(false);
    expect(isWebUrl('data:text/html,<b>')).toBe(false);
    expect(isWebUrl('nope')).toBe(false);
  });
});
