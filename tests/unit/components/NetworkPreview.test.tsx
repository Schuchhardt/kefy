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

    // Hay dos puntos de navegación; hacer click en el segundo notifica al padre
    const dots = document.querySelectorAll('div[style*="cursor: pointer"][style*="border-radius: 3px"]');
    expect(dots.length).toBe(2);
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
    // El estilo de "activo" usa var(--accent) como color de borde.
    expect(linkedinTab.getAttribute('style')).toContain('var(--accent)');
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
