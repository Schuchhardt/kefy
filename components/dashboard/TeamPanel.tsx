'use client';

// ─── Equipo de la organización ───────────────────────────────────────────────
//
// La página de precios anuncia un número de miembros por plan. Hasta ahora no
// existía forma de invitar a nadie, así que ese límite ni se cumplía ni se
// podía alcanzar. Este panel es el flujo que faltaba.
//
// Los errores de /api/team/** llegan en español: se muestra la copy del idioma
// de la interfaz según el status, no el texto del servidor.

import { useState, useEffect, useCallback, useId, type FormEvent } from 'react';
import Button, { Spinner } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import Notice from '@/components/ui/Notice';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import esT from '@/locales/es/dashboard/team';
import enT from '@/locales/en/dashboard/team';
import styles from './TeamPanel.module.css';

interface Member {
  userId: string;
  role: 'owner' | 'admin' | 'member';
  name: string | null;
  email: string | null;
  isSelf: boolean;
}

interface Invitation {
  id: string;
  email: string;
  role: 'admin' | 'member';
  expired: boolean;
}

const T = { es: esT, en: enT } as const;

export default function TeamPanel({ locale, role }: { locale: 'es' | 'en'; role: string }) {
  const t = T[locale] ?? T.es;
  const puedeGestionar = role === 'owner' || role === 'admin';
  const { confirm, dialog } = useConfirm();
  const inviteTitleId = useId();
  const pendingTitleId = useId();

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [limit, setLimit] = useState(1);
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/team/members');
      if (!res.ok) throw new Error('members');
      const data = await res.json();
      setMembers(data.members ?? []);
      setLimit(data.limit ?? 1);
      setUsed(data.used ?? 0);
      setLoadFailed(false);

      if (puedeGestionar) {
        const inv = await fetch('/api/team/invitations');
        if (inv.ok) setInvitations((await inv.json()).invitations ?? []);
      }
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [puedeGestionar]);

  useEffect(() => { void load(); }, [load]);

  function inviteError(status: number, data: { planLimitReached?: boolean }): string {
    if (status === 422) return t.invalidEmail;
    if (status === 409) return t.alreadyMember;
    if (status === 403) return data.planLimitReached ? t.planFull : t.onlyManagers;
    return t.inviteError;
  }

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    const invited = email.trim();
    setSending(true);
    setError('');
    setNotice(null);
    try {
      const res = await fetch('/api/team/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invited, role: inviteRole, lang: locale }),
      });
      const data = await res.json().catch(() => ({})) as { emailSent?: boolean; planLimitReached?: boolean };
      if (!res.ok) {
        setError(inviteError(res.status, data));
        return;
      }
      // La invitación vale aunque el correo falle: el enlace se puede reenviar.
      setNotice(data.emailSent === false
        ? { tone: 'warning', text: t.sentNoEmail }
        : { tone: 'success', text: t.invited(invited) });
      setEmail('');
      await load();
    } catch {
      setError(t.inviteError);
    } finally {
      setSending(false);
    }
  }

  async function revoke(inv: Invitation) {
    setError('');
    setNotice(null);
    setBusyId(inv.id);
    try {
      const res = await fetch(`/api/team/invitations/${inv.id}`, { method: 'DELETE' });
      // 404: ya no estaba pendiente (aceptada o revocada en otra pestaña).
      if (!res.ok && res.status !== 404) setError(t.revokeError);
    } catch {
      setError(t.revokeError);
    } finally {
      setBusyId(null);
    }
    await load();
  }

  async function removeMember(m: Member) {
    const nombre = m.name || m.email || '';
    const ok = await confirm({
      title: t.confirmRemove(nombre),
      message: t.confirmRemoveBody,
      confirmLabel: t.remove,
      cancelLabel: t.cancel,
      danger: true,
    });
    if (!ok) return;

    setError('');
    setNotice(null);
    setBusyId(m.userId);
    try {
      const res = await fetch(`/api/team/members/${m.userId}`, { method: 'DELETE' });
      // 403 con el botón visible solo para quien gestiona: un administrador
      // intentando quitar a otro administrador, que es cosa del dueño.
      if (!res.ok && res.status !== 404) setError(res.status === 403 ? t.removeOnlyOwner : t.removeError);
    } catch {
      setError(t.removeError);
    } finally {
      setBusyId(null);
    }
    await load();
  }

  if (loading) {
    return (
      <p className={styles.loading}>
        <Spinner size={14} /> {t.loading}
      </p>
    );
  }

  const sinCupo = used >= limit;
  const roleLabel = (r: string) =>
    r === 'owner' ? t.roleOwner : r === 'admin' ? t.roleAdmin : t.roleMember;

  return (
    <div className={styles.panel}>
      {loadFailed && (
        <Notice tone="danger">
          <span style={{ marginRight: 10 }}>{t.loadError}</span>
          <Button size="sm" variant="secondary" onClick={() => { setLoading(true); void load(); }}>
            {t.retry}
          </Button>
        </Notice>
      )}

      <p className={styles.seats}>{t.seats(used, limit)}</p>

      {/* Miembros */}
      <ul className={styles.list} aria-label={t.membersLabel}>
        {members.map((m) => {
          const display = m.name || m.email || '';
          return (
            <li key={m.userId} className={styles.row}>
              <div className={styles.who}>
                <p className={styles.name}>
                  {display}
                  {m.isSelf && <span className={styles.self}> · {t.you}</span>}
                </p>
                <p className={styles.meta}>
                  {[m.name ? m.email : null, roleLabel(m.role)].filter(Boolean).join(' · ')}
                </p>
              </div>
              {puedeGestionar && !m.isSelf && m.role !== 'owner' && (
                <Button
                  variant="danger-ghost"
                  size="sm"
                  className={styles.rowAction}
                  onClick={() => void removeMember(m)}
                  loading={busyId === m.userId}
                  disabled={busyId !== null}
                  aria-label={t.removeAria(display)}
                >
                  {t.remove}
                </Button>
              )}
            </li>
          );
        })}
      </ul>

      {!puedeGestionar && <p className={styles.hint}>{t.onlyManagers}</p>}
      {error && <Notice tone="danger">{error}</Notice>}

      {puedeGestionar && (
        <>
          {/* Invitar */}
          <section aria-labelledby={inviteTitleId}>
            <h3 id={inviteTitleId} className={styles.subTitle}>{t.inviteTitle}</h3>
            <form onSubmit={handleInvite} className={styles.invite}>
              <Field label={t.emailLabel} className={styles.inviteEmail}>
                <Input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t.emailPlaceholder}
                  autoComplete="off"
                  disabled={sinCupo}
                />
              </Field>
              <Field label={t.roleLabel} className={styles.inviteRole}>
                <Select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
                  disabled={sinCupo}
                >
                  <option value="member">{t.roleMember}</option>
                  <option value="admin">{t.roleAdmin}</option>
                </Select>
              </Field>
              <Button type="submit" variant="primary" loading={sending} disabled={sinCupo}>
                {sending ? t.inviting : t.invite}
              </Button>
            </form>
            {sinCupo && (
              <p className={styles.hint} style={{ marginTop: 8 }}>
                {t.planFull}{' '}
                <a href={`/${locale}/dashboard/settings#billing`}>{t.seePlans}</a>
              </p>
            )}
          </section>

          {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

          {/* Pendientes */}
          <section aria-labelledby={pendingTitleId}>
            <h3 id={pendingTitleId} className={styles.subTitle}>{t.pending}</h3>
            {invitations.length === 0 ? (
              <p className={styles.hint}>{t.emptyPending}</p>
            ) : (
              <ul className={styles.list}>
                {invitations.map((inv) => (
                  <li key={inv.id} className={styles.row}>
                    <div className={styles.who}>
                      <p className={styles.name} style={{ fontWeight: 500 }}>{inv.email}</p>
                      <p className={styles.meta}>
                        {roleLabel(inv.role)}{inv.expired && ` · ${t.expired}`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={styles.rowAction}
                      onClick={() => void revoke(inv)}
                      loading={busyId === inv.id}
                      disabled={busyId !== null}
                      aria-label={t.revokeAria(inv.email)}
                    >
                      {t.revoke}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {dialog}
    </div>
  );
}
