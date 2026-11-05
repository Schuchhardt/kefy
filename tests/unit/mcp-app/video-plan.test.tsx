// Vista 2 (mcp-app/src/views/VideoPlan.tsx): costo antes de producir, polling
// de get_video_status cada 5 s que se detiene al terminar o al desmontar.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { VideoPlan } from '@/mcp-app/src/views/VideoPlan';
import type { VideoProductionView, VideoView } from '@/lib/mcp-app/contract';
import { BRAND, ITEM, Stateful, fakeHost, makeVideoView, renderWithEnv } from './helpers';

function renderPlan(view: VideoView, host: ReturnType<typeof fakeHost>['host']) {
  return renderWithEnv(
    <Stateful initial={view}>{(v, set) => <VideoPlan view={v} onView={set} />}</Stateful>,
    host,
  );
}

const production = (over: Partial<VideoProductionView> = {}): VideoProductionView => ({
  job_id: 'job-1', status: 'running', progress: 0.25, video_url: null, error: null, motion: 'key', credits_estimate: 30,
  steps: [
    { key: 'img', tool: 'generate_image', label: 'Imagen', scene_order: 1, status: 'done', error: null },
    { key: 'compose', tool: 'compose_video', label: 'Montaje', scene_order: null, status: 'pending', error: null },
  ],
  ...over,
});

afterEach(() => vi.useRealTimers());

describe('plan', () => {
  it('muestra el costo de cada nivel y no produce sin confirmar', async () => {
    const { host, calls } = fakeHost({
      get_video_plan: () => ({ ok: true, data: {}, view: makeVideoView({ plan: { ...makeVideoView().plan!, motion: 'none', credits: 12 } }) }),
      produce_video: () => ({ ok: true, data: {}, view: makeVideoView({ plan: null, production: production() }) }),
    });
    renderPlan(makeVideoView(), host);

    expect(screen.getByRole('radio', { name: /Sin animación.*12 créditos/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Todos los planos.*55 créditos/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('radio', { name: /Sin animación/ }));
    await waitFor(() => expect(calls[0]).toEqual({ name: 'get_video_plan', args: { brand_id: BRAND, item_id: ITEM, motion: 'none' } }));

    fireEvent.click(screen.getByRole('button', { name: 'Producir video (12 créditos)' }));
    expect(calls.some((c) => c.name === 'produce_video')).toBe(false);
    const confirm = screen.getByRole('group', { name: 'Esta acción gasta créditos' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Producir video' }));
    await waitFor(() => expect(calls.find((c) => c.name === 'produce_video')?.args).toEqual({
      brand_id: BRAND, item_id: ITEM, motion: 'none', force: false,
    }));
  });

  it('si ya hay video avisa que se reemplaza y manda force: true', async () => {
    const { host, calls } = fakeHost({ produce_video: () => ({ ok: true, data: {}, view: makeVideoView({ production: production() }) }) });
    const view = makeVideoView({ item: { ...makeVideoView().item, video_url: 'https://s3.us-east-2.amazonaws.com/b/out.mp4' } });
    renderPlan(view, host);
    fireEvent.click(screen.getByRole('button', { name: 'Producir video (30 créditos)' }));
    expect(screen.getByText('Este contenido ya tiene un video')).toBeInTheDocument();
    const confirm = screen.getByRole('group', { name: 'Esta acción gasta créditos' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Producir video' }));
    await waitFor(() => expect(calls.find((c) => c.name === 'produce_video')?.args).toMatchObject({ force: true }));
  });

  it('story sin guion: primero «Preparar guion (1 crédito)» y luego el plan', async () => {
    const { host, calls } = fakeHost({
      prepare_story_video: () => ({ ok: true, data: {}, view: null }),
      get_video_plan: () => ({ ok: true, data: {}, view: makeVideoView({ format: 'story' }) }),
    });
    renderPlan(makeVideoView({ format: 'story', needs_script: true, plan: null, item: { ...makeVideoView().item, content_type: 'story' } }), host);
    fireEvent.click(screen.getByRole('button', { name: 'Preparar guion (1 crédito)' }));
    const confirm = screen.getByRole('group', { name: 'Esta acción gasta créditos' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(calls.map((c) => c.name)).toEqual(['prepare_story_video', 'get_video_plan']));
    expect(await screen.findByText('Plan de producción', { exact: false })).toBeInTheDocument();
  });
});

describe('producción', () => {
  it('consulta get_video_status cada 5 s, termina con el reproductor y avisa al chat una vez', async () => {
    vi.useFakeTimers();
    let n = 0;
    const done = makeVideoView({
      plan: null,
      production: production({ status: 'done', progress: 1, video_url: 'https://s3.us-east-2.amazonaws.com/b/out.mp4' }),
      item: { ...makeVideoView().item, video_url: 'https://s3.us-east-2.amazonaws.com/b/out.mp4' },
      actions: { approve: true, publish: false },
    });
    const { host, calls } = fakeHost({
      get_video_status: () => {
        n += 1;
        return { ok: true, data: {}, view: n < 2 ? makeVideoView({ plan: null, production: production({ progress: 0.6 }) }) : done };
      },
    });
    const { container } = renderPlan(makeVideoView({ production: production() }), host);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(calls.filter((c) => c.name === 'get_video_status')).toHaveLength(1);
    expect(calls[0].args).toEqual({ brand_id: BRAND, item_id: ITEM });
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60');

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(container.querySelector('video')).toHaveAttribute('src', 'https://s3.us-east-2.amazonaws.com/b/out.mp4');
    expect(host.sendMessage).toHaveBeenCalledTimes(1);
    expect(host.sendMessage).toHaveBeenCalledWith('El video de «Reel de lanzamiento» está listo.');
    expect(screen.getByRole('button', { name: 'Aprobar' })).toBeInTheDocument();

    // Terminado: no hay más polling.
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(calls.filter((c) => c.name === 'get_video_status')).toHaveLength(2);
  });

  it('al desmontar la vista (teardown) el polling se detiene', async () => {
    vi.useFakeTimers();
    const { host, calls } = fakeHost({ get_video_status: () => ({ ok: true, data: {}, view: makeVideoView({ production: production() }) }) });
    const { unmount } = renderPlan(makeVideoView({ production: production() }), host);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(calls).toHaveLength(1);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(calls).toHaveLength(1);
  });

  it('si falla muestra el paso y ofrece reintentar con force', async () => {
    const failed = production({
      status: 'failed',
      steps: [{ key: 'tts', tool: 'text_to_speech', label: 'Voz', scene_order: 2, status: 'failed', error: 'quota' }],
    });
    const { host, calls } = fakeHost({ produce_video: () => ({ ok: true, data: {}, view: makeVideoView({ production: production() }) }) });
    renderPlan(makeVideoView({ production: failed }), host);
    expect(screen.getByText(/Falló: Voz — quota/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    const confirm = screen.getByRole('group', { name: 'Esta acción gasta créditos' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(calls.find((c) => c.name === 'produce_video')?.args).toMatchObject({ force: true }));
  });
});
