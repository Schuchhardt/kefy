-- Migration: update interaction_layers to bilingual JSONB structure
-- Changes: { num, title, items } → { num_es, num_en, title_es, title_en, items_es, items_en }
-- Safe to run multiple times (checks for old structure before updating)
-- Created: 2026-05-19

UPDATE kefy_content_strategies
SET interaction_layers = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'num_es',    layer->>'num',
      'num_en',    CASE layer->>'num'
                     WHEN 'CAPA 1' THEN 'LAYER 1'
                     WHEN 'CAPA 2' THEN 'LAYER 2'
                     WHEN 'CAPA 3' THEN 'LAYER 3'
                     ELSE layer->>'num'
                   END,
      'title_es',  layer->>'title',
      'title_en',  CASE layer->>'title'
                     WHEN 'Publicación'                        THEN 'Publishing'
                     WHEN 'Interacción activa (primeras 2 horas)' THEN 'Active engagement (first 2 hours)'
                     WHEN 'Seguimiento (día 3)'                THEN 'Follow-up (day 3)'
                     ELSE layer->>'title'
                   END,
      'items_es',  layer->'items',
      'items_en',  CASE layer->>'title'
                     WHEN 'Publicación' THEN
                       '["Strong hook in the first lines","Body with real value (educational, emotional or proof)","Clear and singular CTA at the end"]'::jsonb
                     WHEN 'Interacción activa (primeras 2 horas)' THEN
                       '["Reply to every comment with open-ended questions","DM profiles that engage and match your ideal customer","Comment on related posts in the niche"]'::jsonb
                     WHEN 'Seguimiento (día 3)' THEN
                       '["Repost the content with a new angle or extra data point","Story reminding followers of the key takeaway","Follow-up DM to warm leads with fresh content"]'::jsonb
                     ELSE layer->'items'
                   END
    )
  )
  FROM jsonb_array_elements(interaction_layers) AS layer
)
WHERE interaction_layers @> '[{"num": "CAPA 1"}]';
