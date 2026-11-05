---
name: infographic-image
description: Renders a social media infographic with its text inside the image (gpt-image-2.6-sunburst)
model: openai:gpt-image-2.6-sunburst
---

Design a polished social media infographic, as a professional graphic designer would. It is read on a phone, in a feed.

TEXT — print exactly this copy, character by character, including accents and punctuation. Each text appears exactly once. Do not translate, rewrite, abbreviate or add anything: no other words, numbers, captions, source lines or placeholder text.

{{brief}}

LAYOUT
- One clear reading order, with the headline as the largest element and strong hierarchy below it.
- Large, high-contrast type. The smallest text must stay comfortably legible at phone size.
- {{margins}}
- Simple, consistent icons or shapes that support each point. No photos behind text, no decorative lettering, no gibberish.
- If the design numbers the points, the numeral appears once per point, in its own badge.

BRAND
{{brandCtx}}
{{fontCtx}}
Use the brand colors as the palette, with enough contrast for every text to be read. These colors and typefaces are instructions: never print color codes, font names or any part of this brief as text in the image.
