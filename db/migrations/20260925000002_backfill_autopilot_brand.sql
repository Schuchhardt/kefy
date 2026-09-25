-- Migration: backfill brand_id del autopilot
-- La ejecución del autopilot creaba el contenido y los posts programados sin
-- brand_id, así que no aparecían en ninguna marca. Ya se guarda (ver
-- lib/services/autopilot.ts); esto arregla lo que se creó antes, tomando la
-- marca de la regla (metadata.rule_id).
-- Created: 2026-09-25

UPDATE kefy_content_items ci
SET brand_id = r.brand_id
FROM kefy_autopilot_rules r
WHERE ci.brand_id IS NULL
  AND r.brand_id IS NOT NULL
  AND ci.org_id = r.org_id
  AND (ci.metadata->>'autopilot')::boolean IS TRUE
  AND ci.metadata->>'rule_id' = r.id::text;

UPDATE kefy_scheduled_posts sp
SET brand_id = ci.brand_id
FROM kefy_content_items ci
WHERE sp.brand_id IS NULL
  AND ci.brand_id IS NOT NULL
  AND sp.content_item_id = ci.id
  AND sp.org_id = ci.org_id;

UPDATE kefy_autopilot_runs ar
SET brand_id = r.brand_id
FROM kefy_autopilot_rules r
WHERE ar.brand_id IS NULL
  AND r.brand_id IS NOT NULL
  AND ar.rule_id = r.id;
