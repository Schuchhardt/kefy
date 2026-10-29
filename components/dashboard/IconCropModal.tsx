'use client';

// ─── Crear un ícono recortando un logo ───────────────────────────────────────
//
// Selección cuadrada sobre el logo: se arrastra con el puntero o se mueve con
// las flechas, y el tamaño va en un deslizador (así se puede usar sin ratón).
// La posición se guarda en fracciones de la imagen (lib/brand-logos.ts): el
// servidor recorta el archivo original a su resolución, no lo que se ve aquí.
// Arranca con el mismo recorte que propone el asistente sin rectángulo.

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import { clampCrop, suggestIconCrop, type CropRect } from '@/lib/brand-logos';
import type { BrandAssetView } from '@/lib/services/brand-assets';
import esT from '@/locales/es/dashboard/brand';
import enT from '@/locales/en/dashboard/brand';
import styles from './BrandLogoLibrary.module.css';

/** Tamaño mínimo de la selección, en fracción del lado corto. */
const MIN_SIDE = 0.08;

export default function IconCropModal({
  asset, locale, onClose, onCreated,
}: {
  asset: BrandAssetView | null;
  locale: 'es' | 'en';
  onClose: () => void;
  onCreated: (icon: BrandAssetView) => void;
}) {
  const t = (locale === 'en' ? enT : esT).logos;
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; rect: CropRect } | null>(null);

  // Proporción ancho/alto de la imagen: la del análisis o, si falta (un SVG
  // antiguo), la que da el navegador al cargarla.
  const [ratio, setRatio] = useState<number | null>(null);
  const [rect, setRect] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    setBusy(false);
    const known = asset?.width && asset?.height ? asset.width / asset.height : null;
    setRatio(known);
    setRect(known && asset?.width && asset?.height ? suggestIconCrop(asset.width, asset.height) : null);
  }, [asset]);

  function onImageLoad(img: HTMLImageElement) {
    if (ratio || !img.naturalWidth || !img.naturalHeight) return;
    setRatio(img.naturalWidth / img.naturalHeight);
    setRect(suggestIconCrop(img.naturalWidth, img.naturalHeight));
  }

  // Un cuadrado en píxeles: alto en fracción = ancho en fracción × (ancho/alto).
  const maxWidth = ratio ? Math.min(1, 1 / ratio) : 1;
  const minWidth = maxWidth * MIN_SIDE;

  function setWidth(width: number) {
    if (!rect || !ratio) return;
    const w = Math.min(maxWidth, Math.max(minWidth, width));
    const h = w * ratio;
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    setRect(clampCrop({ x: cx - w / 2, y: cy - h / 2, width: w, height: h }));
  }

  function moveBy(dx: number, dy: number) {
    if (!rect) return;
    setRect(clampCrop({ ...rect, x: rect.x + dx, y: rect.y + dy }));
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    moveBy(m[0], m[1]);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, rect };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    const stage = stageRef.current?.getBoundingClientRect();
    if (!start || !stage || !stage.width || !stage.height) return;
    setRect(clampCrop({
      ...start.rect,
      x: start.rect.x + (e.clientX - start.px) / stage.width,
      y: start.rect.y + (e.clientY - start.py) / stage.height,
    }));
  }

  function onPointerUp() { drag.current = null; }

  async function create() {
    if (!asset || !rect) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/brand-kit/assets/${asset.id}/icon`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ crop: rect }),
      });
      if (!res.ok) { setError(t.cropFailed); return; }
      const { asset: icon } = await res.json() as { asset: BrandAssetView };
      onCreated(icon);
    } catch {
      setError(t.cropFailed);
    } finally {
      setBusy(false);
    }
  }

  // Vista previa: el mismo recorte como fondo escalado.
  const preview: CSSProperties | undefined = rect && asset ? {
    backgroundImage: `url("${asset.public_url}")`,
    backgroundSize: `${100 / rect.width}% ${100 / rect.height}%`,
    backgroundPosition: `${rect.width < 1 ? (rect.x / (1 - rect.width)) * 100 : 0}% ${rect.height < 1 ? (rect.y / (1 - rect.height)) * 100 : 0}%`,
  } : undefined;

  const sizePercent = rect ? Math.round((rect.width / maxWidth) * 100) : 100;
  const canvas = asset?.background === 'dark' ? styles.canvasDark : styles.canvasLight;

  return (
    <Modal
      open={asset !== null}
      onClose={onClose}
      dismissable={!busy}
      title={t.cropTitle}
      subtitle={t.cropSubtitle}
      maxWidth={640}
      padded
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t.cancel}</Button>
          <Button variant="primary" icon={<Icon name="check" size={16} />} loading={busy} disabled={!rect} onClick={() => { void create(); }}>
            {t.cropCreate}
          </Button>
        </>
      }
    >
      {asset && (
        <div className={styles.cropLayout}>
          <div className={`${styles.cropStage} ${canvas}`}>
            <div ref={stageRef} className={styles.cropImageWrap}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={asset.public_url}
                alt={t.cropAlt}
                className={styles.cropImage}
                draggable={false}
                onLoad={(e) => onImageLoad(e.currentTarget)}
              />
              {rect && (
                <div
                  className={styles.cropBox}
                  role="group"
                  tabIndex={0}
                  aria-label={t.cropArea}
                  aria-describedby="icon-crop-keys"
                  style={{
                    left: `${rect.x * 100}%`,
                    top: `${rect.y * 100}%`,
                    width: `${rect.width * 100}%`,
                    height: `${rect.height * 100}%`,
                  }}
                  onKeyDown={onKeyDown}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                />
              )}
            </div>
          </div>

          <div className={styles.cropSide}>
            <p id="icon-crop-keys" className="ui-hint">{t.cropKeys}</p>

            <div className="ui-field">
              <label htmlFor="icon-crop-size" className="ui-label">{t.cropSize}</label>
              <input
                id="icon-crop-size"
                type="range"
                className={styles.range}
                min={Math.round(MIN_SIDE * 100)}
                max={100}
                step={1}
                value={sizePercent}
                disabled={!rect}
                aria-valuetext={`${sizePercent} %`}
                onChange={(e) => setWidth((Number(e.target.value) / 100) * maxWidth)}
              />
            </div>

            <div>
              <span className="ui-label">{t.cropPreview}</span>
              <div className={styles.previewRow} aria-hidden="true">
                <div className={`${styles.previewSquare} ${canvas}`}><div className={styles.previewFill} style={preview} /></div>
                <div className={`${styles.previewCircle} ${canvas}`}><div className={styles.previewFill} style={preview} /></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12 }}>
          <Notice tone="danger" icon={<Icon name="alert" size={16} />}>{error}</Notice>
        </div>
      )}
    </Modal>
  );
}
