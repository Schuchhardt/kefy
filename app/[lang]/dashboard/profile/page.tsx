'use client';

// ─── Mi perfil ───────────────────────────────────────────────────────────────
//
// Nombre (el único sitio donde se edita: Ajustes solo lo muestra y enlaza
// aquí), contraseña y la organización en modo lectura, con enlace a Ajustes.

import { useState, useEffect, useRef, type CSSProperties, type FormEvent } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { toLocale } from '@/lib/i18n';
import { isBillingPlan, planName } from '@/lib/plans';
import SectionCard from '@/components/ui/SectionCard';
import Button, { ButtonLink } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import Notice from '@/components/ui/Notice';
import Icon from '@/components/ui/icons';
import styles from './page.module.css';

import esT from '@/locales/es/dashboard/profile';
import enT from '@/locales/en/dashboard/profile';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';

const T = { es: esT, en: enT } as const;
const COMMON = { es: esCommon, en: enCommon } as const;

const PLAN_BADGE = {
  '--badge-color': 'var(--accent-text)', '--badge-bg': 'var(--accent-soft)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
} as CSSProperties;
const STARTER_BADGE = { textTransform: 'uppercase', letterSpacing: '0.06em' } as CSSProperties;

/**
 * «Guardado» junto al botón. La región viva está siempre en el DOM: una que
 * aparece a la vez que su texto no siempre se anuncia.
 */
function SavedStatus({ show, label }: { show: boolean; label: string }) {
  return (
    <span role="status" className={styles.saved}>
      {show && (
        <>
          <Icon name="check" size={14} strokeWidth={2.4} />
          {label}
        </>
      )}
    </span>
  );
}

export default function ProfilePage() {
  const { user, org, role, plan, refresh } = useAuth();
  const { lang } = useParams<{ lang: string }>();
  const locale = toLocale(lang);
  const t = T[locale];
  const tc = COMMON[locale];

  // Nombre
  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Contraseña
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  // El «no coinciden» se muestra al salir del campo o al enviar, no con la
  // primera letra que se escribe.
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdSaved, setPwdSaved] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  // Depende del nombre y no del objeto: un re-render con otro `user` igual no
  // debe pisar lo que se está escribiendo.
  const userName = user?.name;
  useEffect(() => {
    if (userName) setName(userName);
  }, [userName]);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingProfile(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        setProfileError(t.saveError);
        return;
      }
      await refresh();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 4000);
    } catch {
      setProfileError(t.saveError);
    } finally {
      setSavingProfile(false);
    }
  }

  const mismatch = confirmPwd !== '' && confirmPwd !== newPwd;

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setConfirmTouched(true);
      confirmRef.current?.focus();
      return;
    }
    setSavingPwd(true);
    setPwdError(null);
    setPwdSaved(false);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPwd, new_password: newPwd }),
      });
      if (!res.ok) {
        // Los campos obligatorios y el mínimo de 8 ya se validan aquí: un 400
        // es la contraseña actual que no coincide. El texto del servidor
        // viene en español, así que no se muestra tal cual.
        setPwdError(res.status === 400 ? t.passwordWrong : t.passwordError);
        return;
      }
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setConfirmTouched(false);
      setPwdSaved(true);
      setTimeout(() => setPwdSaved(false), 4000);
    } catch {
      setPwdError(t.passwordError);
    } finally {
      setSavingPwd(false);
    }
  }

  const userInitial = (user?.name || user?.email || '?').charAt(0).toUpperCase();
  const joinedDate = (user as unknown as { created_at?: string } | null)?.created_at;
  const planLabel = plan ? (isBillingPlan(plan) ? planName(plan, locale) : plan) : null;

  return (
    <div className="page" style={{ maxWidth: 680 }}>
      <header className="page-header">
        <div>
          <h1 style={{ fontFamily: 'var(--font-syne), system-ui, sans-serif' }}>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
      </header>

      {/* ── Avatar y datos rápidos ── */}
      <div className={`ui-card ${styles.hero}`}>
        <div className={styles.avatar} aria-hidden="true">{userInitial}</div>
        <div className={styles.who}>
          <p className={styles.name}>{user?.name || user?.email}</p>
          {user?.name && <p className={styles.meta}>{user.email}</p>}
          {joinedDate && (
            <p className={styles.meta}>
              {t.joined(new Date(joinedDate).toLocaleDateString(t.dateLocale, { day: '2-digit', month: 'long', year: 'numeric' }))}
            </p>
          )}
        </div>
        {planLabel && (
          <span className="ui-badge" style={plan === 'starter' ? STARTER_BADGE : PLAN_BADGE}>
            <span className="sr-only">{t.planLabel}: </span>
            {planLabel}
          </span>
        )}
      </div>

      {/* ── Información personal ── */}
      <SectionCard id="personal-info" title={t.sectionInfo}>
        <form onSubmit={handleSaveProfile} className={styles.form}>
          <div className="grid-2">
            <Field label={t.nameLabel}>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.namePlaceholder}
                autoComplete="name"
                required
              />
            </Field>
            <Field label={t.emailLabel} hint={t.emailNote}>
              <Input type="email" value={user?.email ?? ''} disabled />
            </Field>
          </div>
          <div className={styles.actions}>
            <Button type="submit" variant="primary" loading={savingProfile}>
              {savingProfile ? tc.actions.saving : t.saveProfile}
            </Button>
            <SavedStatus show={profileSaved} label={t.saved} />
          </div>
          {profileError && <Notice tone="danger">{profileError}</Notice>}
        </form>
      </SectionCard>

      {/* ── Contraseña ── */}
      <SectionCard id="password" title={t.sectionPassword}>
        <form onSubmit={handleChangePassword} className={styles.form}>
          <div className="grid-2">
            <Field label={t.currentPassword}>
              <Input
                type="password"
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label={t.newPassword} hint={t.newPasswordHint}>
              <Input
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
            </Field>
          </div>
          <Field
            label={t.confirmPassword}
            error={confirmTouched && mismatch ? t.passwordMismatch : undefined}
            className={styles.half}
          >
            <Input
              ref={confirmRef}
              type="password"
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              onBlur={() => setConfirmTouched(true)}
              autoComplete="new-password"
              required
            />
          </Field>
          <div className={styles.actions}>
            <Button type="submit" variant="secondary" loading={savingPwd}>
              {savingPwd ? tc.actions.saving : t.changePassword}
            </Button>
            <SavedStatus show={pwdSaved} label={t.passwordChanged} />
          </div>
          {pwdError && <Notice tone="danger">{pwdError}</Notice>}
        </form>
      </SectionCard>

      {/* ── Organización (se gestiona en Ajustes) ── */}
      <SectionCard
        id="organization"
        title={t.sectionOrg}
        actions={
          <ButtonLink
            href={`/${locale}/dashboard/settings#org`}
            variant="secondary"
            size="sm"
            icon={<Icon name="settings" size={14} />}
          >
            {t.orgManage}
          </ButtonLink>
        }
      >
        <dl className={styles.facts}>
          <div>
            <dt>{t.orgLabel}</dt>
            <dd>{org?.name ?? '—'}</dd>
          </div>
          <div>
            <dt>{t.roleLabel}</dt>
            <dd>{role ? (t.roles[role] ?? role) : '—'}</dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}
