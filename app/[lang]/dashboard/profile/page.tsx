'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';

// ─── i18n ────────────────────────────────────────────────────────────────────

const T = {
  es: {
    title: 'Mi perfil',
    subtitle: 'Gestiona tu información personal y contraseña',
    sectionInfo: 'Información personal',
    sectionPassword: 'Contraseña',
    sectionOrg: 'Organización',
    nameLabel: 'Nombre',
    namePlaceholder: 'Tu nombre',
    emailLabel: 'Correo electrónico',
    emailNote: 'El correo no se puede cambiar',
    roleLabel: 'Rol',
    planLabel: 'Plan',
    orgLabel: 'Organización',
    joinedLabel: 'Miembro desde',
    currentPassword: 'Contraseña actual',
    newPassword: 'Nueva contraseña',
    newPasswordHint: 'Mínimo 8 caracteres',
    confirmPassword: 'Confirmar nueva contraseña',
    saveProfile: 'Guardar cambios',
    changePassword: 'Cambiar contraseña',
    saving: 'Guardando...',
    saved: '✓ Cambios guardados',
    passwordChanged: '✓ Contraseña actualizada',
    passwordMismatch: 'Las contraseñas no coinciden',
    roles: { owner: 'Propietario', admin: 'Administrador', member: 'Miembro' },
    plans: { starter: 'Starter', pro: 'Pro', business: 'Business' },
  },
  en: {
    title: 'My profile',
    subtitle: 'Manage your personal information and password',
    sectionInfo: 'Personal information',
    sectionPassword: 'Password',
    sectionOrg: 'Organization',
    nameLabel: 'Name',
    namePlaceholder: 'Your name',
    emailLabel: 'Email address',
    emailNote: 'Email cannot be changed',
    roleLabel: 'Role',
    planLabel: 'Plan',
    orgLabel: 'Organization',
    joinedLabel: 'Member since',
    currentPassword: 'Current password',
    newPassword: 'New password',
    newPasswordHint: 'At least 8 characters',
    confirmPassword: 'Confirm new password',
    saveProfile: 'Save changes',
    changePassword: 'Change password',
    saving: 'Saving...',
    saved: '✓ Changes saved',
    passwordChanged: '✓ Password updated',
    passwordMismatch: 'Passwords do not match',
    roles: { owner: 'Owner', admin: 'Admin', member: 'Member' },
    plans: { starter: 'Starter', pro: 'Pro', business: 'Business' },
  },
} as const;

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 14,
  color: 'var(--text)',
  outline: 'none',
  fontFamily: 'var(--font-syne), sans-serif',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--muted)',
  display: 'block',
  marginBottom: 5,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  fontFamily: 'var(--font-syne), sans-serif',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { user, org, role, plan, refresh } = useAuth();
  const { lang } = useParams<{ lang: string }>();
  const t = T[(lang as 'es' | 'en') ?? 'es'] ?? T.es;
  const dateLocale = lang === 'en' ? 'en-US' : 'es-ES';

  // Profile form
  const [name, setName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Password form
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error');
      await refresh();
      setProfileMsg({ type: 'ok', text: t.saved });
      setTimeout(() => setProfileMsg(null), 4000);
    } catch (err) {
      setProfileMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error' });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setPwdMsg({ type: 'err', text: t.passwordMismatch });
      return;
    }
    setSavingPwd(true);
    setPwdMsg(null);
    try {
      const res = await fetch('/api/auth/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPwd, new_password: newPwd }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Error');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setPwdMsg({ type: 'ok', text: t.passwordChanged });
      setTimeout(() => setPwdMsg(null), 4000);
    } catch (err) {
      setPwdMsg({ type: 'err', text: err instanceof Error ? err.message : 'Error' });
    } finally {
      setSavingPwd(false);
    }
  }

  const userInitial = (user?.name ?? user?.email ?? '?')[0].toUpperCase();
  const joinedDate = (user as unknown as { created_at?: string })?.created_at;

  return (
    <div style={{ padding: '40px 48px', maxWidth: 680 }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 36 }}>
        <h1 style={{
          fontFamily: 'var(--font-syne)', fontSize: 26, fontWeight: 700,
          color: 'var(--text)', letterSpacing: '-0.02em', margin: 0,
        }}>
          {t.title}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 5 }}>{t.subtitle}</p>
      </div>

      {/* ── Avatar + quick info ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        marginBottom: 32,
        padding: '20px 24px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 14,
      }}>
        <div style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: 'rgba(198,255,75,0.12)',
          border: '2px solid rgba(198,255,75,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
          fontWeight: 800,
          color: 'var(--accent)',
          flexShrink: 0,
          fontFamily: 'var(--font-syne), sans-serif',
          letterSpacing: '-0.02em',
        }}>
          {userInitial}
        </div>
        <div>
          <p style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text)',
            margin: 0,
            fontFamily: 'var(--font-syne), sans-serif',
            letterSpacing: '-0.02em',
          }}>
            {user?.name ?? user?.email}
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '4px 0 0' }}>
            {user?.email}
          </p>
          {joinedDate && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>
              {t.joinedLabel}{' '}
              {new Date(joinedDate).toLocaleDateString(dateLocale, { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
          )}
        </div>
        {plan && (
          <div style={{ marginLeft: 'auto' }}>
            <span style={{
              display: 'inline-block',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              padding: '4px 10px',
              borderRadius: 6,
              background: plan === 'starter' ? 'var(--border)' : 'rgba(198,255,75,0.12)',
              color: plan === 'starter' ? 'var(--muted)' : 'var(--accent)',
              fontFamily: 'var(--font-syne), sans-serif',
            }}>
              {t.plans[plan as keyof typeof t.plans] ?? plan}
            </span>
          </div>
        )}
      </div>

      {/* ── Personal info ── */}
      <div style={{
        marginBottom: 24,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-syne)', fontSize: 14, fontWeight: 700,
          marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--border)',
          color: 'var(--text)', letterSpacing: '-0.01em',
        }}>
          {t.sectionInfo}
        </h2>
        <form onSubmit={handleSaveProfile}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>{t.nameLabel}</label>
              <input
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.namePlaceholder}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>{t.emailLabel}</label>
              <input
                style={{ ...inputStyle, opacity: 0.55, cursor: 'not-allowed' }}
                value={user?.email ?? ''}
                disabled
                title={t.emailNote}
              />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.emailNote}</p>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              disabled={savingProfile}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                padding: '9px 20px',
                fontWeight: 600,
                fontSize: 13,
                fontFamily: 'var(--font-syne), sans-serif',
                cursor: savingProfile ? 'not-allowed' : 'pointer',
                opacity: savingProfile ? 0.7 : 1,
                transition: 'opacity 0.15s',
              }}
            >
              {savingProfile ? t.saving : t.saveProfile}
            </button>
            {profileMsg && (
              <span style={{
                fontSize: 13,
                color: profileMsg.type === 'ok' ? 'var(--accent)' : '#f87171',
              }}>
                {profileMsg.text}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ── Password ── */}
      <div style={{
        marginBottom: 24,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-syne)', fontSize: 14, fontWeight: 700,
          marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--border)',
          color: 'var(--text)', letterSpacing: '-0.01em',
        }}>
          {t.sectionPassword}
        </h2>
        <form onSubmit={handleChangePassword}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 12 }}>
            <div>
              <label style={labelStyle}>{t.currentPassword}</label>
              <input
                type="password"
                style={inputStyle}
                value={currentPwd}
                onChange={(e) => setCurrentPwd(e.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <div>
              <label style={labelStyle}>{t.newPassword}</label>
              <input
                type="password"
                style={inputStyle}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                minLength={8}
                autoComplete="new-password"
                required
              />
              <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{t.newPasswordHint}</p>
            </div>
          </div>
          <div style={{ marginBottom: 16, maxWidth: 320 }}>
            <label style={labelStyle}>{t.confirmPassword}</label>
            <input
              type="password"
              style={{
                ...inputStyle,
                borderColor: confirmPwd && confirmPwd !== newPwd ? '#f87171' : undefined,
              }}
              value={confirmPwd}
              onChange={(e) => setConfirmPwd(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="submit"
              disabled={savingPwd}
              style={{
                background: 'var(--surface-2)',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '9px 20px',
                fontWeight: 600,
                fontSize: 13,
                fontFamily: 'var(--font-syne), sans-serif',
                cursor: savingPwd ? 'not-allowed' : 'pointer',
                opacity: savingPwd ? 0.7 : 1,
                transition: 'opacity 0.15s, border-color 0.15s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(198,255,75,0.4)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'; }}
            >
              {savingPwd ? t.saving : t.changePassword}
            </button>
            {pwdMsg && (
              <span style={{
                fontSize: 13,
                color: pwdMsg.type === 'ok' ? 'var(--accent)' : '#f87171',
              }}>
                {pwdMsg.text}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ── Organization ── */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '20px 24px',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-syne)', fontSize: 14, fontWeight: 700,
          marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--border)',
          color: 'var(--text)', letterSpacing: '-0.01em',
        }}>
          {t.sectionOrg}
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>{t.orgLabel}</label>
            <input
              style={{ ...inputStyle, opacity: 0.55, cursor: 'not-allowed' }}
              value={org?.name ?? ''}
              disabled
            />
          </div>
          <div>
            <label style={labelStyle}>{t.roleLabel}</label>
            <input
              style={{ ...inputStyle, opacity: 0.55, cursor: 'not-allowed' }}
              value={t.roles[(role as keyof typeof t.roles)] ?? role ?? ''}
              disabled
            />
          </div>
        </div>
      </div>

    </div>
  );
}
