'use client';

// Contenido del selector de marca: la lista y el alta de una marca nueva.
// Lo comparten el selector del sidebar (escritorio) y el de la barra superior
// (móvil), para que ambos se comporten igual sin duplicar la lógica.

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useBrand } from '@/lib/brand-context';
import BrandAvatar from '@/components/dashboard/BrandAvatar';
import Button from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import Icon from '@/components/ui/icons';
import esT from '@/locales/es/dashboard/brand-menu';
import enT from '@/locales/en/dashboard/brand-menu';
import styles from './BrandMenu.module.css';

const T = { es: esT, en: enT } as const;

export default function BrandMenu({
  lang = 'es',
  onDone,
}: {
  lang?: 'es' | 'en';
  /** Se llama tras cambiar o crear una marca, para que el contenedor cierre. */
  onDone: () => void;
}) {
  const { brands, activeBrand, canCreate, switchBrand, createBrand } = useBrand();
  const t = T[lang] ?? T.es;

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSwitch(id: string) {
    if (id === activeBrand?.id) { onDone(); return; }
    try {
      await switchBrand(id);
    } catch {
      // El contexto ya deja el estado como estaba; cerrar es lo correcto.
    }
    onDone();
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !canCreate) return;
    setSaving(true);
    setError(null);
    try {
      await createBrand(name);
      setNewName('');
      setCreating(false);
      onDone();
    } catch (err) {
      // El servidor responde en inglés («Your plan allows…», «name is
      // required»): a la persona, la copy de su idioma.
      console.error('[brand menu] createBrand failed:', err);
      setError(t.createError);
    } finally {
      setSaving(false);
    }
  }

  function cancelCreate() {
    setCreating(false);
    setError(null);
    setNewName('');
  }

  return (
    <>
      <ul className={styles.list} aria-label={t.brandsLabel}>
        {brands.map((b) => {
          const active = b.id === activeBrand?.id;
          return (
            <li key={b.id}>
              <button
                type="button"
                onClick={() => void handleSwitch(b.id)}
                aria-current={active ? 'true' : undefined}
                className={`ui-hoverable ${styles.item}`}
              >
                {/* El nombre ya se lee al lado: el avatar no lo repite. */}
                <span className={styles.avatar} aria-hidden="true">
                  <BrandAvatar brand={b} size={22} />
                </span>
                <span className={styles.itemName}>{b.name}</span>
                {active && <Icon name="check" size={14} strokeWidth={2.5} className={styles.check} />}
              </button>
            </li>
          );
        })}
      </ul>

      <div className={styles.divider} />

      {creating ? (
        <form className={styles.create} onSubmit={handleCreate}>
          {!canCreate && (
            <p className={styles.limit} role="status">
              {t.planLimit}{' '}
              <Link href={`/${lang}/dashboard/settings#billing`} onClick={onDone}>
                {t.upgrade}
              </Link>
            </p>
          )}
          <Field label={t.nameLabel} hideLabel>
            <Input
              autoFocus
              type="text"
              placeholder={t.namePlaceholder}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') cancelCreate(); }}
              disabled={saving || !canCreate}
            />
          </Field>
          {error && <p className={styles.error} role="alert">{error}</p>}
          <div className={styles.createActions}>
            <Button
              type="submit"
              size="sm"
              variant="primary"
              loading={saving}
              disabled={!newName.trim() || !canCreate}
            >
              {saving ? t.creating : t.create}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelCreate}>
              {t.cancel}
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className={`ui-hoverable ${styles.newBrand}`}
        >
          <Icon name="plus" size={14} strokeWidth={2} />
          {t.newBrand}
        </button>
      )}
    </>
  );
}
