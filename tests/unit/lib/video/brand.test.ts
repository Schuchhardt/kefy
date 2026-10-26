import { describe, it, expect } from 'vitest';
import {
  contrastRatio, displayDomain, FALLBACK_THEME, instagramHandle, normalizeHex, readableOn,
  resolveFilmTheme, videoBrandBrief, voiceAccent,
} from '@/lib/video/brand';
import { pickMusicTrack, MUSIC_TRACKS, TRACK_MOODS } from '@/remotion/audio-tracks';

describe('normalizeHex', () => {
  it('acepta los formatos que llegan del Brand Kit y del enriquecimiento por URL', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('1E90FF')).toBe('#1e90ff');
    expect(normalizeHex('#1e90ffcc')).toBe('#1e90ff');
    expect(normalizeHex('rgb(30, 144, 255)')).toBe('#1e90ff');
  });

  it('descarta lo que no es un color', () => {
    expect(normalizeHex('azul')).toBeNull();
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex(null)).toBeNull();
  });
});

describe('resolveFilmTheme', () => {
  it('sin Brand Kit usa el respaldo completo y no muestra marca', () => {
    const t = resolveFilmTheme(null);
    expect(t).toMatchObject({
      accent: FALLBACK_THEME.accent,
      primary: FALLBACK_THEME.primary,
      headingFont: 'Montserrat', bodyFont: 'Montserrat', branded: false,
    });
    expect(t.brandName).toBeUndefined();
    expect(t.logoUrl).toBeUndefined();
  });

  it('usa los colores, tipografías, logo y contacto de la marca', () => {
    const t = resolveFilmTheme({
      name: 'Depando', tagline: 'Arriendos sin estrés', accent_color: '#FF5A36', primary_color: '#0E2A47',
      font_heading: 'Playfair Display', font_body: 'Lato', logo_url: 'https://cdn.example.com/logo.png',
      website_url: 'https://www.depando.cl/arriendos',
    });
    expect(t).toMatchObject({
      accent: '#ff5a36', primary: '#0e2a47', headingFont: 'Playfair Display', bodyFont: 'Lato',
      brandName: 'Depando', tagline: 'Arriendos sin estrés', logoUrl: 'https://cdn.example.com/logo.png',
      contact: 'depando.cl', branded: true,
    });
  });

  it('el texto sobre el acento y sobre el fondo siempre es legible', () => {
    for (const accent of ['#ffd23f', '#1e3a8a', '#ff5a36', '#10b981', '#7c3aed']) {
      const t = resolveFilmTheme({ accent_color: accent, primary_color: '#fafafa' });
      expect(contrastRatio(t.accent, t.onAccent)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.primary, t.onPrimary)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('un acento gris, negro o blanco no sirve: usa el primario o el respaldo', () => {
    expect(resolveFilmTheme({ accent_color: '#000000', primary_color: '#e11d48' }).accent).toBe('#e11d48');
    expect(resolveFilmTheme({ accent_color: '#888888' }).accent).toBe(FALLBACK_THEME.accent);
    expect(resolveFilmTheme({ accent_color: '#ffffff' }).accent).toBe(FALLBACK_THEME.accent);
  });

  it('un primario claro se oscurece para que el fondo lleve texto blanco', () => {
    const t = resolveFilmTheme({ primary_color: '#ffe4e6' });
    expect(t.onPrimary).toBe('#ffffff');
  });

  it('una fuente que no está en el catálogo cae al respaldo, y una sola fuente sirve para las dos', () => {
    expect(resolveFilmTheme({ font_heading: 'Helvetica Neue Pro' }).headingFont).toBe('Montserrat');
    expect(resolveFilmTheme({ font_heading: 'Oswald' })).toMatchObject({ headingFont: 'Oswald', bodyFont: 'Oswald' });
  });

  it('sin web usa el @ de Instagram; un logo sin https no se usa', () => {
    const t = resolveFilmTheme({ name: 'X', social_urls: { instagram: 'https://instagram.com/depando.cl/' }, logo_url: 'http://insecure/logo.png' });
    expect(t.contact).toBe('@depando.cl');
    expect(t.logoUrl).toBeUndefined();
  });
});

describe('textos de marca', () => {
  it('displayDomain e instagramHandle', () => {
    expect(displayDomain('depando.cl')).toBe('depando.cl');
    expect(displayDomain('not a url')).toBeNull();
    expect(instagramHandle('https://www.instagram.com/p/abc')).toBeNull();
    expect(readableOn('#ffd23f')).toBe('#0b0b0f');
    expect(readableOn('#1e3a8a')).toBe('#ffffff');
  });

  it('el brief lleva el perfil de la marca para el copy', () => {
    const brief = videoBrandBrief({
      name: 'Depando', target_audience: 'propietarios con depto en Santiago', differentiators: ['check-in digital', 'limpieza incluida'],
      tone: ['cercano', 'experto'], website_url: 'https://depando.cl', uses_emojis: false,
    }, 'es');
    expect(brief).toContain('Depando');
    expect(brief).toContain('propietarios con depto en Santiago');
    expect(brief).toContain('check-in digital; limpieza incluida');
    expect(brief).toContain('depando.cl');
    expect(brief).toContain('No emojis');
    expect(brief).toMatch(/never invent prices/);
  });

  it('sin Brand Kit, el brief es una guía de respaldo y no un hueco', () => {
    expect(videoBrandBrief(null, 'es')).toMatch(/no brand profile yet/);
  });

  it('el acento de la voz sale de dónde están los clientes', () => {
    expect(voiceAccent({ customer_locations: ['Madrid, España'] }, 'es')).toMatch(/Spain/);
    expect(voiceAccent(null, 'es')).toMatch(/neutral Latin American/);
    expect(voiceAccent(null, 'en')).toMatch(/English/);
  });
});

describe('pickMusicTrack', () => {
  it('es determinístico por id', () => {
    expect(pickMusicTrack('item-1')).toBe(pickMusicTrack('item-1'));
  });

  it('con un ánimo, elige entre las pistas de ese ánimo', () => {
    const track = pickMusicTrack('item-1', 'energético, dinámico')!;
    expect(TRACK_MOODS[track]).toContain('energetic');
  });

  it('todas las pistas tienen ánimo y un ánimo desconocido usa cualquier pista', () => {
    for (const t of MUSIC_TRACKS) expect(TRACK_MOODS[t]?.length).toBeGreaterThan(0);
    expect(MUSIC_TRACKS).toContain(pickMusicTrack('x', 'qwerty'));
  });

  it('no repite las pistas recientes de la marca mientras el ánimo tenga otras', () => {
    const mood = 'uplifting hopeful inspirational friendly';
    const recent: string[] = [];
    for (let i = 0; i < 3; i++) {
      const track = pickMusicTrack(`item-${i}`, mood, recent)!;
      expect(recent).not.toContain(track);
      expect(TRACK_MOODS[track]!.some((m) => m === 'friendly' || m === 'emotional')).toBe(true);
      recent.unshift(track);
    }
  });

  it('si todas las pistas son recientes, igual elige una', () => {
    expect(MUSIC_TRACKS).toContain(pickMusicTrack('x', 'calm', MUSIC_TRACKS));
  });
});
