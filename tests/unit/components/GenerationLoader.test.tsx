import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GenerationLoader from '@/components/ui/GenerationLoader';

/** Width of the filled part of the progress bar, as rendered inline. */
function barWidth(container: HTMLElement): string | undefined {
  const bar = container.querySelector('div[style*="border-radius: 99px"] > div');
  return (bar as HTMLElement | null)?.style.width;
}

describe('GenerationLoader', () => {
  it('muestra el porcentaje redondeado', () => {
    render(<GenerationLoader progress={0.42} />);
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('acompaña el porcentaje con la estimación cuando se pasa hint', () => {
    render(<GenerationLoader progress={0.5} hint="~25 s" />);
    expect(screen.getByText('50% · ~25 s')).toBeInTheDocument();
  });

  it('la barra refleja el progreso', () => {
    const { container } = render(<GenerationLoader progress={0.6} />);
    expect(barWidth(container)).toBe('60%');
  });

  // Que la barra jamás llegue a 0 evita que se lea como "no está pasando nada".
  it('deja una franja visible en 0', () => {
    const { container } = render(<GenerationLoader progress={0} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(barWidth(container)).toBe('2%');
  });

  it('clampea valores fuera de rango', () => {
    const { rerender } = render(<GenerationLoader progress={1.8} />);
    expect(screen.getByText('100%')).toBeInTheDocument();

    rerender(<GenerationLoader progress={-3} />);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('permite ocultar barra, porcentaje y spinner por separado', () => {
    const { container } = render(
      <GenerationLoader progress={0.4} showBar={false} showPercent={false} />,
    );
    expect(screen.queryByText('40%')).not.toBeInTheDocument();
    expect(barWidth(container)).toBeUndefined();
    // El anillo sigue presente (es el único indicador que queda)
    expect(container.querySelector('div[style*="border-radius: 50%"]')).not.toBeNull();

    const withoutSpinner = render(<GenerationLoader progress={0.4} showSpinner={false} />).container;
    expect(withoutSpinner.querySelector('div[style*="border-radius: 50%"]')).toBeNull();
    expect(barWidth(withoutSpinner)).toBe('40%');
  });
});
