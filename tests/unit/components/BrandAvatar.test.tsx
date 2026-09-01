import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BrandAvatar, { brandImage, brandColor } from '@/components/dashboard/BrandAvatar';
import type { Brand } from '@/lib/brand-context';

function marca(over: Partial<Brand> = {}): Brand {
  return {
    id: 'b1', org_id: 'org-1', name: 'Acme', slug: 'acme',
    avatar_url: null, kit_logo_url: null,
    archived: false, created_at: '', updated_at: '',
    ...over,
  } as Brand;
}

describe('brandImage', () => {
  it('prefiere la imagen propia de la marca', () => {
    expect(brandImage(marca({
      avatar_url: 'https://cdn/avatar.webp',
      kit_logo_url: 'https://cdn/logo.png',
    }))).toBe('https://cdn/avatar.webp');
  });

  // Quien ya subió su logo al definir la identidad no debería tener que subir
  // la misma imagen otra vez solo para el selector.
  it('cae en el logo del Brand Kit cuando no hay imagen propia', () => {
    expect(brandImage(marca({ kit_logo_url: 'https://cdn/logo.png' })))
      .toBe('https://cdn/logo.png');
  });

  it('devuelve null si no hay ninguna de las dos', () => {
    expect(brandImage(marca())).toBeNull();
  });

  it('tolera una marca nula', () => {
    expect(brandImage(null)).toBeNull();
  });

  // Una cadena vacía en la base es tan «sin imagen» como un null: si se
  // devolviera tal cual, el <img> quedaría roto.
  it('trata la cadena vacía como ausencia de imagen', () => {
    expect(brandImage(marca({ avatar_url: '', kit_logo_url: '' }))).toBeNull();
  });
});

describe('brandColor', () => {
  it('la misma marca siempre recibe el mismo color', () => {
    expect(brandColor('abc')).toBe(brandColor('abc'));
  });
});

describe('<BrandAvatar />', () => {
  it('pinta la imagen de la marca con su nombre como texto alternativo', () => {
    render(<BrandAvatar brand={marca({ avatar_url: 'https://cdn/a.webp' })} />);
    const img = screen.getByAltText('Acme') as HTMLImageElement;
    expect(img.src).toBe('https://cdn/a.webp');
  });

  it('pinta el logo del kit cuando no hay imagen propia', () => {
    render(<BrandAvatar brand={marca({ kit_logo_url: 'https://cdn/logo.png' })} />);
    expect((screen.getByAltText('Acme') as HTMLImageElement).src).toBe('https://cdn/logo.png');
  });

  it('sin imagen muestra la inicial en mayúscula', () => {
    render(<BrandAvatar brand={marca({ name: 'kefy' })} />);
    expect(screen.getByText('K')).toBeInTheDocument();
  });

  it('respeta el tamaño pedido', () => {
    const { container } = render(<BrandAvatar brand={marca()} size={40} />);
    expect((container.firstChild as HTMLElement).style.width).toBe('40px');
  });
});
