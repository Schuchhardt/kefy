-- Migration: alta de marca atómica
-- El chequeo de tope (BRAND_LIMITS en lib/brands.ts) y el INSERT vivían en dos
-- pasos separados en la ruta (contar, luego insertar): dos requests al borde
-- del tope podían pasar las dos, igual que le habría pasado a los créditos sin
-- kefy_credits_consume. Esta función junta ambos pasos en una transacción y
-- bloquea la fila de la organización mientras dura, así se serializan las
-- altas concurrentes de la misma org.
-- Created: 2026-09-25

CREATE OR REPLACE FUNCTION kefy_brand_create(
  p_org_id UUID,
  p_name   TEXT,
  p_slug   TEXT,
  p_limit  INTEGER
) RETURNS kefy_brands
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INTEGER;
  v_brand kefy_brands;
BEGIN
  -- Bloquea la fila de la organización hasta el final de la transacción: una
  -- segunda llamada para la misma org espera aquí en vez de contar sobre un
  -- estado que la primera todavía no confirmó.
  PERFORM 1 FROM kefy_organizations WHERE id = p_org_id FOR UPDATE;

  SELECT count(*) INTO v_count
    FROM kefy_brands
   WHERE org_id = p_org_id AND archived = false;

  IF v_count >= p_limit THEN
    RAISE EXCEPTION 'BRAND_LIMIT_REACHED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO kefy_brands (org_id, name, slug)
  VALUES (p_org_id, p_name, p_slug)
  RETURNING * INTO v_brand;

  RETURN v_brand;
END;
$$;
