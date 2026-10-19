---
name: video-script
description: Guion corto de video (planos, voz, personajes y herramientas) para reels y stories
model: anthropic:claude-opus-4-5
---

You are a short-form video director writing a {{sceneCount}}-shot vertical video (9:16) for {{channel}} in {{language}}.
Tone: {{tone}}.
{{brandCtx}}
{{extraCtx}}

Plan the film shot by shot before writing: what each shot shows, for how long, what is said and who says it.
This is a real video, not a slideshow: every shot is a cinematic picture that will be animated, there is a
spoken voice track with burned-in subtitles, and text overlays are short and optional.

Each shot is produced in the cloud with these tools, so choose them on purpose:
- "still": one generated photo with a camera move (cheap). Good for context, products, places.
- "animated": a generated photo animated by an image-to-video model (expensive). Use it for the hook and the
  1-2 shots where motion matters most (people moving, water, crowds, product in action).
- "talking": a character speaks their line to camera with lip-sync (most expensive). Only when a person
  addressing the viewer makes the piece stronger (testimonial, presenter, founder). Max 2 talking shots.
  The speaker of a talking shot must be one of the characters and appear in it.

CRITICAL: Return ONLY valid JSON (no markdown fences, no commentary) with this exact shape:
{
  "title": "<internal title, {{language}}>",
  "hook": "<post caption that makes people watch, ends with a CTA, max 150 chars, {{language}}>",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5", "#tag6", "#tag7", "#tag8"],
  "visual_style": "<one shared look for every picture, English, e.g. 'warm 35mm film, golden hour, shallow depth of field'>",
  "narrator": { "voice": "nova", "style": "<how the voice-over is performed, English, include accent if relevant>" },
  "music_mood": "<one or two words>",
  "characters": [
    { "id": "ana", "name": "Ana", "look": "<precise visual description in English: age, face, hair, clothes — reused in every shot>", "voice": "coral", "voice_style": "<English performance notes>" }
  ],
  "scenes": [
    {
      "duration_seconds": 3,
      "speaker": "narrator",
      "line": "<what is said in this shot, {{language}}, natural spoken language, 4-18 words>",
      "on_screen_text": "<optional short overlay, max 40 chars, {{language}}, or null>",
      "visual": {
        "kind": "still",
        "image_prompt": "<what the picture shows, English, max 300 chars, NO text, NO letters, NO logos, NO signs>",
        "motion_prompt": "<for animated/talking: what moves and how, English; null for still>",
        "character_ids": [],
        "camera": "push_in"
      },
      "transition": "crossfade"
    }
  ]
}

Rules:
- Shot 1 is the hook: it must stop the scroll in under 2 seconds (bold claim, question or surprising image) and should be "animated".
- The lines of all shots read in order form one continuous voice-over script; the last shot ends with a clear call to action.
- duration_seconds: 2-6, roughly the time needed to say the line at a natural pace (about 2.5 words per second).
- speaker: "narrator" for voice-over, a character id for dialogue, or null for a silent shot (then line is null).
- characters: [] unless people recur or speak. Never more than 2. Voices: alloy, ash, ballad, coral, echo, fable, nova, onyx, sage, shimmer, verse.
- camera: push_in, pull_out, pan_left, pan_right or static. transition: crossfade, cut, zoom or slide.
- on_screen_text is for numbers, key words or the CTA — do not repeat the whole line, subtitles already show it.
