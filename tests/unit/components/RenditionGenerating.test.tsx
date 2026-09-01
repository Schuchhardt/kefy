import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  ESTIMATED_MS,
  RenditionGenerating,
  estimateProgress,
  stepIndexFor,
} from '@/components/dashboard/content/RenditionGenerating';

// Regresión: al pulsar «Generar versión de carrusel» lo único que pasaba era
// que el botón cambiaba a «Generando…». La petición tarda entre medio minuto y
// dos minutos: sin barra ni forma visible de avance parecía colgado.

describe('estimateProgress', () => {
  it('arranca en cero y avanza con el tiempo', () => {
    expect(estimateProgress(0, 100_000)).toBe(0);
    expect(estimateProgress(50_000, 100_000)).toBeCloseTo(0.5, 3);
  });

  // Nunca 100 %: el endpoint no reporta avance real, así que la barra no puede
  // afirmar que terminó antes de que llegue la respuesta.
  it('se frena antes del 100 % mientras no haya respuesta', () => {
    expect(estimateProgress(500_000, 100_000)).toBe(0.95);
    expect(estimateProgress(1e9, 100_000)).toBeLessThan(1);
  });

  it('no explota con una estimación degenerada', () => {
    expect(estimateProgress(1000, 0)).toBe(0.95);
  });
});

describe('stepIndexFor', () => {
  it('recorre los pasos en orden a medida que avanza', () => {
    expect(stepIndexFor(0, 3)).toBe(0);
    expect(stepIndexFor(0.5, 3)).toBe(1);
    expect(stepIndexFor(0.95, 3)).toBe(2);
  });

  it('nunca se sale del rango de pasos', () => {
    expect(stepIndexFor(1, 3)).toBe(2);
    expect(stepIndexFor(0, 0)).toBe(0);
  });
});

describe('<RenditionGenerating />', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('anuncia a lectores de pantalla que hay algo en curso', () => {
    render(<RenditionGenerating format="carousel" lang="es" />);
    const status = screen.getByRole('status');
    expect(status.getAttribute('aria-busy')).toBe('true');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('muestra el primer paso del carrusel, no un genérico «cargando»', () => {
    render(<RenditionGenerating format="carousel" lang="es" />);
    expect(screen.getByText('Escribiendo los slides…')).toBeTruthy();
  });

  it('avanza de paso conforme pasa el tiempo', () => {
    render(<RenditionGenerating format="carousel" lang="es" estimatedMs={3_000} />);
    expect(screen.getByText('Escribiendo los slides…')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(1_500); });
    expect(screen.getByText('Generando las imágenes…')).toBeTruthy();

    act(() => { vi.advanceTimersByTime(1_500); });
    expect(screen.getByText('Armando el carrusel…')).toBeTruthy();
  });

  it('el porcentaje sube de verdad, no se queda en cero', () => {
    render(<RenditionGenerating format="post" lang="es" estimatedMs={10_000} />);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByText(/5[0-9]%/)).toBeTruthy();
  });

  it('cada formato tiene sus propios pasos', () => {
    const { unmount } = render(<RenditionGenerating format="reel" lang="es" />);
    expect(screen.getByText('Escribiendo el guion…')).toBeTruthy();
    unmount();

    render(<RenditionGenerating format="story" lang="es" />);
    expect(screen.getByText('Adaptando el texto…')).toBeTruthy();
  });

  it('está traducido', () => {
    render(<RenditionGenerating format="carousel" lang="en" />);
    expect(screen.getByText('Writing the slides…')).toBeTruthy();
  });

  it('un carrusel estima bastante más que un post: son 5 imágenes', () => {
    expect(ESTIMATED_MS.carousel).toBeGreaterThan(ESTIMATED_MS.post);
    expect(ESTIMATED_MS.reel).toBeGreaterThan(ESTIMATED_MS.story);
  });

  it('limpia su intervalo al desmontarse', () => {
    const clear = vi.spyOn(window, 'clearInterval');
    render(<RenditionGenerating format="post" lang="es" />).unmount();
    expect(clear).toHaveBeenCalled();
  });
});
