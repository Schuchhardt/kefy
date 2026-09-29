import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NetworkPreview } from '@/components/dashboard/NetworkPreview';
import type { CarouselSlide, ReelScene } from '@/types/content';

const baseProps = {
  defaultChannel: 'instagram',
  body: 'Un caption de prueba',
  imageUrl: null,
  videoUrl: null,
  hashtags: ['#test'],
  username: 'marca',
  logoUrl: null,
  activeSlide: 0,
  onActiveSlideChange: vi.fn(),
};

const slides: CarouselSlide[] = [
  { slide_order: 1, title: 'Slide uno', body: 'Cuerpo uno', image_url: null },
  { slide_order: 2, title: 'Slide dos', body: 'Cuerpo dos', image_url: null },
];

describe('NetworkPreview', () => {
  it('post: renderiza una pestaña por cada red del formato', () => {
    render(<NetworkPreview {...baseProps} contentType="post" slides={[]} />);
    // post → instagram, facebook, linkedin, twitter, threads, tiktok
    const tabs = screen.getAllByRole('button').filter((b) => b.getAttribute('title'));
    expect(tabs).toHaveLength(6);
  });

  it('carousel: muestra el slide activo y cambia con onActiveSlideChange al click en los puntos', () => {
    const onActiveSlideChange = vi.fn();
    render(
      <NetworkPreview
        {...baseProps}
        onActiveSlideChange={onActiveSlideChange}
        contentType="carousel"
        slides={slides}
        activeSlide={0}
      />,
    );
    // El slide activo (0) se muestra
    expect(screen.getByText('Slide uno')).toBeInTheDocument();

    // Hay dos puntos de navegación (botones con nombre); hacer click en el
    // segundo notifica al padre
    const dots = screen.getAllByRole('button', { name: /^Slide \d+ de 2$/ });
    expect(dots).toHaveLength(2);
    expect(dots[0]).toHaveAttribute('aria-current', 'true');
    fireEvent.click(dots[1]);
    expect(onActiveSlideChange).toHaveBeenCalledWith(1);
  });

  it('carousel: respeta el activeSlide recibido del padre', () => {
    render(
      <NetworkPreview
        {...baseProps}
        contentType="carousel"
        slides={slides}
        activeSlide={1}
      />,
    );
    expect(screen.getByText('Slide dos')).toBeInTheDocument();
  });

  it('cambiar de red no rompe el render (LinkedIn)', () => {
    render(<NetworkPreview {...baseProps} contentType="post" slides={[]} />);
    const linkedinTab = screen.getByTitle('LinkedIn');
    fireEvent.click(linkedinTab);
    // La cuenta de la marca sigue presente tras cambiar de red
    expect(screen.getAllByText('marca').length).toBeGreaterThan(0);
  });

  it('respeta un `channel` controlado por el padre en vez de elegir la primera red', () => {
    render(
      <NetworkPreview
        {...baseProps}
        contentType="post"
        slides={[]}
        channel="linkedin"
        onChannelChange={vi.fn()}
      />,
    );
    const linkedinTab = screen.getByTitle('LinkedIn');
    // La pestaña activa se anuncia con aria-pressed (y así se pinta en CSS).
    expect(linkedinTab).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTitle('Instagram')).toHaveAttribute('aria-pressed', 'false');
  });

  it('notifica al padre en vez de cambiar de red internamente cuando `onChannelChange` está definido', () => {
    const onChannelChange = vi.fn();
    render(
      <NetworkPreview
        {...baseProps}
        contentType="post"
        slides={[]}
        channel="linkedin"
        onChannelChange={onChannelChange}
      />,
    );
    fireEvent.click(screen.getByTitle('Instagram'));
    expect(onChannelChange).toHaveBeenCalledWith('instagram');
  });

  it('marca con un indicador las redes en `publishedNetworks`', () => {
    render(
      <NetworkPreview
        {...baseProps}
        contentType="post"
        slides={[]}
        publishedNetworks={['linkedin']}
      />,
    );
    const linkedinTab = screen.getByTitle('LinkedIn');
    const instagramTab = screen.getByTitle('Instagram');
    expect(linkedinTab.querySelector('span')).not.toBeNull();
    expect(instagramTab.querySelector('span')).toBeNull();
  });

  it('reel: usa el frame vertical y muestra la escena activa', () => {
    const scenes: ReelScene[] = [
      { scene_order: 1, title: 'Escena uno', body: 'Hook', duration_seconds: 3, image_url: null },
    ];
    render(
      <NetworkPreview
        {...baseProps}
        contentType="reel"
        slides={scenes}
        activeSlide={0}
      />,
    );
    expect(screen.getByText('Escena uno')).toBeInTheDocument();
    // reel → instagram, tiktok, facebook
    const tabs = screen.getAllByRole('button').filter((b) => b.getAttribute('title'));
    expect(tabs).toHaveLength(3);
  });
});

// ─── Accesibilidad y móvil (auditoría UX 5.2/5.5) ──────────────────────────

describe('NetworkPreview — accesibilidad', () => {
  it('las pestañas de red tienen nombre propio y dicen si ya se publicó ahí', () => {
    render(
      <NetworkPreview {...baseProps} contentType="post" slides={[]} publishedNetworks={['linkedin']} />,
    );
    expect(screen.getByRole('button', { name: 'LinkedIn (ya publicado)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Instagram' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Ver la vista previa en' })).toBeTruthy();
  });

  it('las flechas de slides avanzan y retroceden, y no pasan de los extremos', () => {
    const onActiveSlideChange = vi.fn();
    const { rerender } = render(
      <NetworkPreview {...baseProps} onActiveSlideChange={onActiveSlideChange} contentType="carousel" slides={slides} activeSlide={0} />,
    );
    expect(screen.getByRole('button', { name: 'Slide anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Slide siguiente' }));
    expect(onActiveSlideChange).toHaveBeenCalledWith(1);

    rerender(<NetworkPreview {...baseProps} onActiveSlideChange={onActiveSlideChange} contentType="carousel" slides={slides} activeSlide={1} />);
    expect(screen.getByRole('button', { name: 'Slide siguiente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Slide anterior' }));
    expect(onActiveSlideChange).toHaveBeenLastCalledWith(0);
  });

  it('la interfaz simulada de la red no mete botones falsos en el orden de tabulación', () => {
    render(<NetworkPreview {...baseProps} contentType="post" slides={[]} channel="linkedin" onChannelChange={vi.fn()} />);
    // «Seguir», «Me gusta»… son imitación: no son botones.
    expect(screen.queryByRole('button', { name: /seguir|me gusta|comentar/i })).toBeNull();
  });

  it('en inglés la interfaz simulada también está en inglés', () => {
    render(<NetworkPreview {...baseProps} contentType="post" slides={[]} lang="en" />);
    expect(screen.getByText(/Instagram ·/).textContent).toContain('Now');
    expect(screen.getByRole('group', { name: 'Preview on' })).toBeTruthy();
  });

  it('con frameMaxHeight el marco vertical se estrecha sin cambiar su proporción', () => {
    const scenes: ReelScene[] = [{ scene_order: 1, title: 'Escena', body: '', duration_seconds: 3, image_url: null }];
    const { container } = render(
      <NetworkPreview {...baseProps} contentType="reel" slides={scenes} frameMaxHeight="min(560px, 50dvh)" />,
    );
    const media = Array.from(container.querySelectorAll('div')).find((d) => d.style.aspectRatio === '9 / 16');
    expect(media).toBeTruthy();
    const frame = media!.parentElement as HTMLElement;
    expect(frame.style.getPropertyValue('--frame-max-h')).toBe('min(560px, 50dvh)');
  });
});
