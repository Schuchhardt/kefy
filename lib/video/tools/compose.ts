// compose_video — el montaje final en Remotion Lambda (composición KefyFilm).
// Recibe la línea de tiempo ya resuelta (lib/video/timeline.ts) con las URLs
// de las fotos, clips y voces, y devuelve el MP4 en S3. Mismas credenciales y
// mismo despliegue que el render de siempre (docs/reel-render.md).

import { getRenderProgress, renderMediaOnLambda } from '@remotion/lambda/client';
import { TOOL_CREDIT_OPERATION, type VideoTool } from './types';

type AwsRegion = Parameters<typeof renderMediaOnLambda>[0]['region'];

function env(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var: ${key}`);
  return v;
}

export const FILM_COMPOSITION_ID = 'KefyFilm';

export const composeVideoTool: VideoTool = {
  name:     'compose_video',
  label:    { es: 'Montaje', en: 'Final edit' },
  summary:  {
    es: 'Une clips, fotos animadas, voces, subtítulos, música, transiciones y logo en el MP4 final.',
    en: 'Cuts clips, animated photos, voices, subtitles, music, transitions and logo into the final MP4.',
  },
  provider: 'remotion',
  credit:   TOOL_CREDIT_OPERATION.compose_video,
  mode:     'async',
  available: () => !!(process.env.REMOTION_LAMBDA_FUNCTION_NAME && process.env.REMOTION_SERVE_URL),

  async run(_ctx, input) {
    const { renderId, bucketName } = await renderMediaOnLambda({
      region:          env('REMOTION_AWS_REGION') as AwsRegion,
      functionName:    env('REMOTION_LAMBDA_FUNCTION_NAME'),
      serveUrl:        env('REMOTION_SERVE_URL'),
      composition:     FILM_COMPOSITION_ID,
      inputProps:      input,
      codec:           'h264',
      imageFormat:     'jpeg',
      jpegQuality:     85,
      framesPerLambda: 120,
      downloadBehavior: { type: 'play-in-browser' },
    });
    return { status: 'pending', handle: { render_id: renderId, bucket: bucketName } };
  },

  async poll(_ctx, handle) {
    const renderId = typeof handle.render_id === 'string' ? handle.render_id : '';
    const bucket   = typeof handle.bucket === 'string' ? handle.bucket : '';
    if (!renderId || !bucket) return { status: 'failed', error: 'handle de Remotion inválido' };
    const progress = await getRenderProgress({
      renderId,
      bucketName:   bucket,
      functionName: env('REMOTION_LAMBDA_FUNCTION_NAME'),
      region:       env('REMOTION_AWS_REGION') as AwsRegion,
    });
    if (progress.fatalErrorEncountered) {
      return { status: 'failed', error: progress.errors?.[0]?.message ?? 'Lambda render failed' };
    }
    if (progress.done && progress.outputFile) {
      return { status: 'done', output: { video_url: progress.outputFile } };
    }
    return { status: 'pending', handle: { ...handle, progress: progress.overallProgress ?? 0 } };
  },
};
