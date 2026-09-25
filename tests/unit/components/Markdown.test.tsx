import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Markdown from '@/components/assistant/Markdown';

// El texto del asistente mezcla lo que escribe el modelo con datos de terceros
// (DMs, comentarios, páginas web). El renderer no puede producir HTML activo
// ni enlaces a esquemas peligrosos, pase lo que pase por el texto.

function renderMd(text: string, props: Partial<Parameters<typeof Markdown>[0]> = {}) {
  return render(<Markdown text={text} {...props} />);
}

describe('Markdown — HTML crudo', () => {
  it('no crea elementos a partir de etiquetas HTML: salen como texto', () => {
    const { container } = renderMd('Hola <img src=x onerror="alert(1)"> y <script>alert(2)</script> <b>negrita</b>');

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.querySelector('[onerror]')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
    expect(container.textContent).toContain('<script>alert(2)</script>');
  });

  it('no interpreta HTML dentro de un bloque de código ni de una tabla', () => {
    const { container } = renderMd([
      '```',
      '<iframe src="https://evil.example"></iframe>',
      '```',
      '',
      '| a | b |',
      '|---|---|',
      '| <svg onload=alert(1)> | ok |',
    ].join('\n'));

    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('pre')?.textContent).toContain('<iframe');
    expect(container.querySelector('td')?.textContent).toBe('<svg onload=alert(1)>');
  });

  it('quita las etiquetas <untrusted_content> pero deja su contenido como texto', () => {
    const { container } = renderMd('Mensaje: <untrusted_content source="dm">hola <b>x</b></untrusted_content>');
    expect(container.textContent).not.toContain('untrusted_content');
    expect(container.textContent).toContain('hola <b>x</b>');
    expect(container.querySelector('b')).toBeNull();
  });
});

describe('Markdown — enlaces', () => {
  it.each([
    ['javascript:', '[clic](javascript:alert(1))'],
    ['JaVaScRiPt: con mayúsculas', '[clic](JaVaScRiPt:alert(document.cookie))'],
    ['data:', '[clic](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)'],
    ['vbscript:', '[clic](vbscript:msgbox)'],
    ['mailto:', '[clic](mailto:a@b.com)'],
    ['protocol-relative //', '[clic](//evil.example/x)'],
    ['barra invertida /\\', '[clic](/\\evil.example/x)'],
    ['esquema raro', '[clic](file:///etc/passwd)'],
  ])('%s sale como texto, sin <a>', (_label, md) => {
    const { container } = renderMd(md);
    expect(container.querySelector('a')).toBeNull();
    expect(screen.getByText('clic')).toBeInTheDocument();
  });

  it('ningún <a> generado lleva un href que no sea http(s) o relativo', () => {
    const { container } = renderMd([
      '[a](javascript:alert(1)) [b](https://ok.example/x) [c](/es/dashboard) [d](//evil.example)',
      'javascript:alert(1) data:text/html,<b>x</b> http://ok2.example',
    ].join('\n'));

    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(href, href).toMatch(/^(https?:\/\/|\/(?![/\\]))/);
    }
  });

  it('los enlaces http(s) abren en otra pestaña sin opener y muestran el dominio', () => {
    const { container } = renderMd('Mira [la guía](https://www.example.com/guia?x=1)');
    const a = container.querySelector('a')!;

    expect(a.getAttribute('href')).toBe('https://www.example.com/guia?x=1');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(a.getAttribute('rel')).toContain('noreferrer');
    expect(a.getAttribute('rel')).toContain('nofollow');
    expect(container.textContent).toContain('(example.com)');
  });

  it('el texto del enlace no puede disfrazar el dominio real', () => {
    const { container } = renderMd('[https://kefy.app/login](https://evil.example/login)');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('https://evil.example/login');
    expect(container.textContent).toContain('(evil.example)');
  });

  it('las comillas en la URL no escapan del atributo', () => {
    const { container } = renderMd('[x](https://ok.example/a"onmouseover="alert(1))');
    const a = container.querySelector('a');
    expect(a).not.toBeNull();
    expect(a!.getAttribute('onmouseover')).toBeNull();
    expect(a!.getAttribute('href')).not.toContain('"');
  });

  it('las URL sueltas http(s) se enlazan; javascript: suelto no', () => {
    const { container } = renderMd('Ver https://ok.example/p. Y javascript:alert(1)');
    const anchors = container.querySelectorAll('a');
    expect(anchors).toHaveLength(1);
    expect(anchors[0].getAttribute('href')).toBe('https://ok.example/p');
  });

  it('los enlaces relativos navegan dentro de la app y avisan al panel', () => {
    const onInternalNavigate = vi.fn();
    const { container } = renderMd('Abre [el calendario](/es/dashboard/content/calendar)', { onInternalNavigate });
    const a = container.querySelector('a')!;

    expect(a.getAttribute('href')).toBe('/es/dashboard/content/calendar');
    expect(a.getAttribute('target')).toBeNull();
    fireEvent.click(a);
    expect(onInternalNavigate).toHaveBeenCalledTimes(1);
  });
});

describe('Markdown — formato', () => {
  it('pinta negrita, cursiva, código, listas y encabezados', () => {
    const { container } = renderMd([
      '## Resumen',
      'Texto con **negrita**, *cursiva* y `código`.',
      '',
      '- uno',
      '- dos',
      '',
      '1. primero',
      '2. segundo',
    ].join('\n'));

    expect(container.querySelector('strong')?.textContent).toBe('negrita');
    expect(container.querySelector('em')?.textContent).toBe('cursiva');
    expect(container.querySelector('code')?.textContent).toBe('código');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(2);
    expect(screen.getByText('Resumen')).toBeInTheDocument();
  });

  it('no revienta con texto vacío ni con un bloque de código sin cerrar (stream a medias)', () => {
    expect(() => renderMd('')).not.toThrow();
    const { container } = renderMd('```js\nconst a = 1;');
    expect(container.querySelector('pre')?.textContent).toBe('const a = 1;');
  });
});
