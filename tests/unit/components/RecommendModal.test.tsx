import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import RecommendModal from '@/components/dashboard/content/RecommendModal';
import type { Recommendation } from '@/types/strategy';

// La pista para guiar las ideas vivía en el formulario de generar, y su Enter
// disparaba recomendaciones en vez de generar. Ahora está en el modal, con un
// botón «Buscar ideas» explícito: Enter hace lo mismo que ese botón.

const rec = (over: Partial<Recommendation> = {}): Recommendation => ({
  topic: 'Cómo elegir la talla correcta',
  content_type: 'carousel',
  rationale: { goal: 'Educar', rationale_short: '' },
  ...over,
} as Recommendation);

function renderModal(props: Partial<React.ComponentProps<typeof RecommendModal>> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onSelect: vi.fn(),
    onRotate: vi.fn(),
    onSearch: vi.fn(),
    onHintChange: vi.fn(),
  };
  render(
    <RecommendModal
      open
      lang="es"
      recs={[rec()]}
      loading={false}
      error={null}
      sourceText=""
      hint="tono divertido"
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('<RecommendModal />', () => {
  it('Enter en la pista busca ideas (no elige ni genera)', () => {
    const h = renderModal();
    const input = screen.getByRole('textbox', { name: /guiar las ideas/ });
    expect(input).toHaveValue('tono divertido');

    fireEvent.submit(input.closest('form')!);
    expect(h.onSearch).toHaveBeenCalledTimes(1);
    expect(h.onSelect).not.toHaveBeenCalled();
  });

  it('el botón «Buscar ideas» está junto a la pista', () => {
    const h = renderModal();
    const search = screen.getByRole('search');
    fireEvent.click(within(search).getByRole('button', { name: 'Buscar ideas' }));
    expect(h.onSearch).toHaveBeenCalledTimes(1);
  });

  it('escribir en la pista la actualiza', () => {
    const h = renderModal();
    fireEvent.change(screen.getByRole('textbox', { name: /guiar las ideas/ }), { target: { value: 'otra pista' } });
    expect(h.onHintChange).toHaveBeenCalledWith('otra pista');
  });

  it('elegir una idea la entrega al padre', () => {
    const h = renderModal();
    fireEvent.click(screen.getByRole('button', { name: /Cómo elegir la talla correcta/ }));
    expect(h.onSelect).toHaveBeenCalledWith(expect.objectContaining({ topic: 'Cómo elegir la talla correcta' }));
  });

  it('«Otras ideas» queda fijo al pie y pide otra tanda', () => {
    const h = renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Otras ideas' }));
    expect(h.onRotate).toHaveBeenCalledTimes(1);
  });

  it('el error se anuncia', () => {
    renderModal({ error: 'No pudimos generar recomendaciones. Intenta de nuevo.', recs: [] });
    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos generar recomendaciones');
  });

  it('en inglés, la etiqueta de idea generada por IA dice «AI»', () => {
    renderModal({ lang: 'en', recs: [rec({ week_num: undefined, post_num: undefined })] });
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.queryByText('IA')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Find ideas' })).toBeInTheDocument();
  });
});
