// Vista 1 (mcp-app/src/views/ContentReview.tsx) con un host falso.
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { ContentReview } from '@/mcp-app/src/views/ContentReview';
import type { ContentView } from '@/lib/mcp-app/contract';
import { BRAND, ITEM, Stateful, fakeHost, makeItem, makeView, renderWithEnv } from './helpers';

function renderReview(view: ContentView, host: ReturnType<typeof fakeHost>['host'], onOpenVideo = vi.fn(async () => {})) {
  return renderWithEnv(
    <Stateful initial={view}>
      {(v, set) => <ContentReview view={v} onView={set} onOpenVideo={onOpenVideo} />}
    </Stateful>,
    host,
  );
}

const btn = (name: string | RegExp) => screen.getByRole('button', { name });

describe('texto no confiable', () => {
  it('un body con <img onerror> se pinta como TEXTO, nunca como HTML', () => {
    const evil = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const { host } = fakeHost();
    const { container } = renderReview(makeView([makeItem({ content_type: 'story', title: evil, body: evil })]), host);
    expect(screen.getAllByText(evil, { exact: false }).length).toBeGreaterThan(0);
    expect(container.querySelector('img[onerror]')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
    // Solo la imagen real de la story.
    expect([...container.querySelectorAll('img')].every((i) => i.getAttribute('src')?.startsWith('https://'))).toBe(true);
  });
});

describe('layout por tipo', () => {
  it('story: marco 9:16 con el caption encima de la imagen', () => {
    const { host } = fakeHost();
    const { container } = renderReview(makeView([makeItem({ content_type: 'story' })]), host);
    expect(container.querySelector('.k-frame-916 .k-frame__caption')).toHaveTextContent('Llega la nueva colección');
  });

  it('story con video: reproductor con la imagen de póster', () => {
    const { host } = fakeHost();
    const { container } = renderReview(makeView([makeItem({ content_type: 'story', video_url: 'https://s3.us-east-2.amazonaws.com/b/out.mp4' })]), host);
    const video = container.querySelector('video')!;
    expect(video).toHaveAttribute('src', 'https://s3.us-east-2.amazonaws.com/b/out.mp4');
    expect(video).toHaveAttribute('poster', makeItem().image_url!);
    expect(video).toHaveAttribute('controls');
  });

  it('carrusel: una tarjeta por slide e indicador 1/N', () => {
    const { host } = fakeHost();
    const slides = [1, 2, 3].map((n) => ({ slide_order: n, title: `T${n}`, body: `B${n}`, image_url: null, duration_seconds: null }));
    renderReview(makeView([makeItem({ content_type: 'carousel', slides })]), host);
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getAllByRole('figure')).toHaveLength(3);
  });

  it('reel sin video: storyboard, aviso y «Producir video» abre la Vista 2', async () => {
    const { host } = fakeHost();
    const onOpenVideo = vi.fn(async () => {});
    const slides = [1, 2].map((n) => ({ slide_order: n, title: `Escena ${n}`, body: null, image_url: null, duration_seconds: 3 }));
    renderReview(makeView([makeItem({ content_type: 'reel', slides, actions: { ...makeItem().actions, produce_video: true } })]), host, onOpenVideo);
    expect(screen.getByText('Video no producido aún')).toBeInTheDocument();
    expect(screen.getByText('Escena 2')).toBeInTheDocument();
    fireEvent.click(btn('Producir video'));
    await waitFor(() => expect(onOpenVideo).toHaveBeenCalled());
  });

  it('variantes: pestañas arriba', () => {
    const { host } = fakeHost();
    renderReview(makeView([makeItem(), makeItem({ id: 'b', title: 'Otra' })]), host);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    fireEvent.click(tabs[1]);
    expect(screen.getByText('Otra')).toBeInTheDocument();
  });
});

describe('acciones', () => {
  it('aprobar llama update_content con brand_id y recarga la pieza', async () => {
    const approved = makeItem({ status: 'approved', actions: { ...makeItem().actions, approve: false, unapprove: true, publish: true }, publish_blocked: null });
    const { host, calls } = fakeHost({ review_content: () => ({ ok: true, data: {}, view: makeView([approved]) }) });
    renderReview(makeView([makeItem()]), host);

    expect(screen.queryByRole('button', { name: 'Publicar o programar' })).toBeNull();
    fireEvent.click(btn('Aprobar'));
    await waitFor(() => expect(screen.getByText('Aprobado')).toBeInTheDocument());

    expect(calls[0]).toEqual({ name: 'update_content', args: { brand_id: BRAND, item_id: ITEM, status: 'approved' } });
    expect(calls[1]).toEqual({ name: 'review_content', args: { brand_id: BRAND, item_id: ITEM } });
    expect(btn('Publicar o programar')).toBeInTheDocument();
    expect(host.updateModelContext).toHaveBeenCalled();
  });

  it('archivar pide confirmación antes', async () => {
    const { host, calls } = fakeHost();
    renderReview(makeView([makeItem()]), host);
    fireEvent.click(btn('Archivar'));
    expect(calls).toHaveLength(0);
    const confirm = screen.getByRole('group', { name: '¿Archivar este contenido?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Archivar' }));
    await waitFor(() => expect(calls[0]).toMatchObject({ name: 'update_content', args: { status: 'archived' } }));
  });

  it('regenerar imagen muestra el costo y no gasta nada hasta confirmar', async () => {
    const { host, calls } = fakeHost({ generate_content_image: () => ({ ok: true, data: {}, view: null }) });
    const item = makeItem({ content_type: 'story', default_image_size: '1024x1792' });
    renderReview(makeView([item]), host);

    fireEvent.click(btn('Regenerar imagen'));
    fireEvent.change(screen.getByLabelText('¿Qué cambio?'), { target: { value: 'más cálida, con el logo más chico' } });
    fireEvent.click(btn(/Regenerar imagen · 3 créditos/));
    expect(screen.getByText('Esta acción gasta créditos')).toBeInTheDocument();
    expect(calls).toHaveLength(0);

    const confirm = screen.getByRole('group', { name: 'Esta acción gasta créditos' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Regenerar imagen' }));
    await waitFor(() => expect(calls[0]?.name).toBe('generate_content_image'));
    expect(calls[0].args).toMatchObject({
      brand_id: BRAND, item_id: ITEM, size: '1024x1792', reference_image_urls: [item.image_url],
      prompt: expect.stringContaining('más cálida, con el logo más chico'),
    });
  });

  it('sin créditos suficientes el botón de confirmar se desactiva', () => {
    const { host } = fakeHost();
    renderReview(makeView([makeItem()], { credits: { remaining: 1, image: 3, story_script: 1, convert: { post: 4, carousel: 16, reel: 16, story: 4 } } }), host);
    fireEvent.click(btn('Regenerar imagen'));
    fireEvent.change(screen.getByLabelText('¿Qué cambio?'), { target: { value: 'x' } });
    fireEvent.click(btn(/Regenerar imagen · 3 créditos/));
    const confirm = screen.getByRole('group', { name: 'Esta acción gasta créditos' });
    expect(within(confirm).getByRole('button', { name: 'Regenerar imagen' })).toBeDisabled();
    expect(screen.getByText('No te alcanzan los créditos de este mes.')).toBeInTheDocument();
  });

  it('pedir cambios manda el mensaje al chat con el id del contenido', async () => {
    const { host } = fakeHost();
    renderReview(makeView([makeItem()]), host);
    fireEvent.click(btn('Pedir cambios'));
    fireEvent.change(screen.getByLabelText('¿Qué quieres cambiar?'), { target: { value: 'que el caption mencione el descuento del 20%' } });
    fireEvent.click(btn('Enviar al chat'));
    await waitFor(() => expect(host.sendMessage).toHaveBeenCalledWith(
      `Sobre el contenido ${ITEM}: que el caption mencione el descuento del 20%`,
    ));
  });

  it('un error del servidor sale en un toast con su code', async () => {
    const { host } = fakeHost({ update_content: () => ({ ok: false, code: 'subscription_required', message: 'Sin plan', timeout: false }) });
    const { toast } = renderReview(makeView([makeItem()]), host);
    fireEvent.click(btn('Aprobar'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Error subscription_required: Sin plan', 'error'));
  });

  it('una conexión de solo lectura no ofrece botones que muten', () => {
    const { host } = fakeHost();
    const ro = { approve: false, unapprove: false, archive: false, edit: false, regenerate_image: false, convert: false, produce_video: false, publish: false };
    renderReview(makeView([makeItem({ actions: ro })], { permissions: { write: false, publish: false } }), host);
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull();
    expect(screen.getByText(/solo puede leer/)).toBeInTheDocument();
    expect(btn('Abrir en Kefy')).toBeInTheDocument();
  });
});

describe('publicar', () => {
  it('lista las cuentas reales, exige revisión y llama publish_content', async () => {
    const approved = makeItem({ status: 'approved', actions: { ...makeItem().actions, approve: false, unapprove: true, publish: true }, publish_blocked: null });
    const { host, calls } = fakeHost({
      list_social_accounts: () => ({ ok: true, view: null, data: { accounts: [
        { id: 'acc-1', platform: 'instagram', username: 'kefy.app', status: 'active' },
        { id: 'acc-2', platform: 'tiktok', username: 'kefy', status: 'disconnected' },
      ] } }),
      publish_content: () => ({ ok: true, view: null, data: { mode: 'now', results: [{ social_account_id: 'acc-1', status: 'published' }] } }),
      review_content: () => ({ ok: true, data: {}, view: makeView([{ ...approved, status: 'published', actions: { ...approved.actions, publish: false } }]) }),
    });
    renderReview(makeView([approved]), host);

    fireEvent.click(btn('Publicar o programar'));
    const tiktok = await screen.findByRole('checkbox', { name: /@kefy\b.*TikTok/ });
    expect(tiktok).toBeDisabled();
    // Con una sola cuenta activa, viene marcada.
    expect(screen.getByRole('checkbox', { name: /@kefy\.app/ })).toBeChecked();

    fireEvent.click(btn('Continuar'));
    const review = screen.getByRole('group', { name: 'Revisa antes de publicar' });
    expect(within(review).getByText('@kefy.app')).toBeInTheDocument();
    expect(within(review).getByText(/Instagram/)).toBeInTheDocument();
    expect(within(review).getByText('Publicar ahora no se puede deshacer.')).toBeInTheDocument();
    expect(calls.some((c) => c.name === 'publish_content')).toBe(false);

    fireEvent.click(within(review).getByRole('button', { name: 'Publicar ahora' }));
    await waitFor(() => expect(calls.find((c) => c.name === 'publish_content')?.args).toEqual({
      brand_id: BRAND, item_id: ITEM, social_account_ids: ['acc-1'], when: 'now',
    }));
    await waitFor(() => expect(host.sendMessage).toHaveBeenCalledWith('Publiqué «Lanzamiento» en 1 cuenta.'));
  });
});
