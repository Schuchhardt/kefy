import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SlideCanvas } from '@/components/dashboard/CarouselPreview';
import { NetworkPreview } from '@/components/dashboard/NetworkPreview';
import { safeAreaFor } from '@/lib/preview-layout';
import type { CarouselSlide } from '@/types/content';

// Regresión (producción): la imagen guardada del slide traía el texto quemado
// —y en el runtime de Vercel salía como cuadraditos vacíos— y encima la app le
// dibujaba OTRA vez el mismo texto en HTML. Ahora la imagen se guarda limpia y
// el texto vive sólo en el overlay HTML, colocado donde la red no lo tapa.

const slide: CarouselSlide = {
  slide_order: 1,
  title: 'Publicar más no es mejor',
  body:  'La frecuencia sin estrategia no vende',
  image_url: 'https://cdn.example.com/s1.jpeg',
  text_baked: false,
};

function styleOf(el: Element | null | undefined) {
  return (el as HTMLElement | null)?.style;
}

describe('<SlideCanvas />', () => {
  it('el texto del slide se dibuja como HTML sobre la imagen', () => {
    render(<SlideCanvas slide={slide} index={0} total={3} />);
    expect(screen.getByText('Publicar más no es mejor')).toBeTruthy();
    expect(screen.getByText('La frecuencia sin estrategia no vende')).toBeTruthy();
  });

  it('la imagen se muestra limpia: no se le añade texto en el src', () => {
    const { container } = render(<SlideCanvas slide={slide} index={0} total={3} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://cdn.example.com/s1.jpeg');
  });

  it('el overlay no intercepta clics del carrusel', () => {
    const { container } = render(<SlideCanvas slide={slide} index={0} total={3} />);
    const overlay = Array.from(container.querySelectorAll('div'))
      .find((d) => d.textContent?.includes('Publicar más no es mejor') && d.style.position === 'absolute');
    expect(styleOf(overlay)?.pointerEvents).toBe('none');
  });

  it('en Instagram el marco es cuadrado', () => {
    const { container } = render(<SlideCanvas slide={slide} index={0} total={3} platform="instagram" format="carousel" />);
    expect(styleOf(container.firstElementChild)?.aspectRatio).toBe('1 / 1');
  });

  it('en TikTok el marco es vertical, como la superficie real', () => {
    const { container } = render(<SlideCanvas slide={slide} index={0} total={3} platform="tiktok" format="carousel" />);
    expect(styleOf(container.firstElementChild)?.aspectRatio).toBe('9 / 16');
  });

  it('en TikTok el texto se aparta de la columna de like/comentarios', () => {
    const { container } = render(<SlideCanvas slide={slide} index={0} total={3} platform="tiktok" format="carousel" />);
    const overlay = Array.from(container.querySelectorAll('div'))
      .find((d) => d.textContent?.includes('Publicar más no es mejor') && d.style.position === 'absolute');

    const safe = safeAreaFor('tiktok', 'carousel');
    expect(styleOf(overlay)?.paddingRight).toBe(`${(safe.right * 100).toFixed(2)}%`);
    expect(styleOf(overlay)?.paddingBottom).toBe(`${(safe.bottom * 100).toFixed(2)}%`);
    // Y ese margen es de verdad grande, no el margen tipográfico de un feed.
    expect(safe.right).toBeGreaterThan(safeAreaFor('instagram', 'carousel').right * 2);
  });

  it('sin imagen cae en la tarjeta de degradado con el texto legible', () => {
    render(<SlideCanvas slide={{ ...slide, image_url: null }} index={0} total={3} />);
    expect(screen.getByText('Publicar más no es mejor')).toBeTruthy();
    expect(screen.getByText('1 / 3')).toBeTruthy();
  });
});

describe('<NetworkPreview /> — carrusel por red', () => {
  const common = {
    contentType: 'carousel' as const,
    defaultChannel: 'instagram',
    body: 'La descripción del carrusel',
    imageUrl: null,
    videoUrl: null,
    hashtags: [],
    slides: [slide],
    activeSlide: 0,
    onActiveSlideChange: () => {},
    username: 'kefy',
  };

  it('TikTok muestra su propia interfaz encima del contenido', () => {
    render(<NetworkPreview {...common} defaultChannel="tiktok" networks={['tiktok']} />);
    // El @usuario, el audio y el contador de interacciones son justamente lo
    // que tapa la imagen y lo que el preview tenía que reproducir.
    expect(screen.getByText('@kefy')).toBeTruthy();
    expect(screen.getByText(/sonido original/)).toBeTruthy();
    expect(screen.getByText('Para ti')).toBeTruthy();
  });

  it('Instagram no dibuja la interfaz de TikTok', () => {
    render(<NetworkPreview {...common} networks={['instagram']} />);
    expect(screen.queryByText(/sonido original/)).toBeNull();
  });

  it('se ciñe a las redes de las cuentas elegidas', () => {
    const { container } = render(<NetworkPreview {...common} networks={['tiktok']} />);
    const tabs = container.querySelectorAll('button[title]');
    expect(Array.from(tabs).map((t) => t.getAttribute('title'))).toEqual(['TikTok']);
  });

  it('sin redes elegidas ofrece todas las relevantes para el formato', () => {
    const { container } = render(<NetworkPreview {...common} networks={[]} />);
    const tabs = container.querySelectorAll('button[title]');
    expect(tabs.length).toBeGreaterThan(1);
  });

  it('ignora una red que no aplica a este formato', () => {
    // 'twitter' no está entre las redes de carrusel: no debe dejar la barra vacía.
    const { container } = render(<NetworkPreview {...common} networks={['twitter']} />);
    expect(container.querySelectorAll('button[title]').length).toBeGreaterThan(1);
  });
});
