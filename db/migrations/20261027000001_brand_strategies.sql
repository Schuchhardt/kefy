-- Migration: la estrategia activa pasa a ser de cada marca
-- Hasta ahora kefy_org_strategies tenía una fila por organización y todas sus
-- marcas compartían la estrategia. Ahora hay una fila por marca (brand_id
-- único), así una org con varias marcas puede llevar una estrategia distinta
-- en cada una.
--
-- Las estrategias propias (kefy_custom_strategies) siguen siendo de la org: son
-- una biblioteca que cualquiera de sus marcas puede activar.
--
-- Se conserva el nombre de la tabla. Backfill: la selección de cada org se
-- copia a todas sus marcas, con el mismo created_at (la semana en curso del
-- calendario no se mueve). Una org sin marcas pierde su fila: no había a quién
-- aplicársela.
-- Created: 2026-10-27

ALTER TABLE kefy_org_strategies
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES kefy_brands(id) ON DELETE CASCADE;

-- Primero se quita el UNIQUE (org_id) original, se llame como se llame: si no,
-- la copia a las demás marcas choca con él.
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'kefy_org_strategies'::regclass
      AND con.contype = 'u'
      AND array_length(con.conkey, 1) = 1
      AND att.attname = 'org_id'
  LOOP
    EXECUTE format('ALTER TABLE kefy_org_strategies DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- La fila existente pasa a la marca más antigua (activas primero)…
UPDATE kefy_org_strategies os
SET brand_id = (
  SELECT b.id FROM kefy_brands b
  WHERE b.org_id = os.org_id
  ORDER BY b.archived, b.created_at
  LIMIT 1
)
WHERE os.brand_id IS NULL;

-- …y se copia al resto de marcas de la org.
INSERT INTO kefy_org_strategies (
  org_id, brand_id, objective_id, industry_id, strategy_id, custom_strategy_id, custom_notes, created_at, updated_at
)
SELECT DISTINCT ON (b.id) os.org_id, b.id, os.objective_id, os.industry_id, os.strategy_id, os.custom_strategy_id, os.custom_notes,
       os.created_at, os.updated_at
FROM kefy_org_strategies os
JOIN kefy_brands b ON b.org_id = os.org_id AND b.id <> os.brand_id
WHERE NOT EXISTS (SELECT 1 FROM kefy_org_strategies x WHERE x.brand_id = b.id)
ORDER BY b.id, os.updated_at DESC;

DELETE FROM kefy_org_strategies WHERE brand_id IS NULL;

ALTER TABLE kefy_org_strategies ALTER COLUMN brand_id SET NOT NULL;

ALTER TABLE kefy_org_strategies DROP CONSTRAINT IF EXISTS kefy_org_strategies_brand_id_key;
ALTER TABLE kefy_org_strategies ADD CONSTRAINT kefy_org_strategies_brand_id_key UNIQUE (brand_id);
