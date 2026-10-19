// Registro de herramientas de video. El plan (lib/video/plan.ts) solo puede
// usar estas; el motor las despacha por nombre.

import { generateImageTool } from './image';
import { textToSpeechTool } from './voice';
import { animateImageTool, lipSyncTool } from './motion';
import { composeVideoTool } from './compose';
import type { VideoTool, VideoToolName } from './types';

export const VIDEO_TOOLS: Record<VideoToolName, VideoTool> = {
  generate_image: generateImageTool,
  text_to_speech: textToSpeechTool,
  animate_image:  animateImageTool,
  lip_sync:       lipSyncTool,
  compose_video:  composeVideoTool,
};

export function getVideoTool(name: string): VideoTool | null {
  return (VIDEO_TOOLS as Record<string, VideoTool>)[name] ?? null;
}

export type { VideoTool, VideoToolName, ToolResult, ToolRunContext } from './types';
export { VIDEO_TOOL_NAMES } from './types';
