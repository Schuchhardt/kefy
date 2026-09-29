import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ImageGeneratingSpinner } from '@/components/dashboard/ImageGeneratingSpinner';

// Sin `label`, el texto por defecto era «Generando imagen…» también para la
// interfaz en inglés (NetworkPreview no le pasa idioma).

describe('<ImageGeneratingSpinner />', () => {
  afterEach(() => { document.documentElement.lang = ''; });

  it('usa el idioma del documento cuando no se le pasa ninguno', () => {
    document.documentElement.lang = 'en';
    render(<ImageGeneratingSpinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Generating image…');
  });

  it('en español por defecto', () => {
    document.documentElement.lang = 'es';
    render(<ImageGeneratingSpinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Generando imagen…');
  });

  it('respeta el idioma y la etiqueta explícitos', () => {
    document.documentElement.lang = 'es';
    const { rerender } = render(<ImageGeneratingSpinner lang="en" />);
    expect(screen.getByRole('status')).toHaveTextContent('Generating image…');
    rerender(<ImageGeneratingSpinner label="Generando…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Generando…');
  });
});
