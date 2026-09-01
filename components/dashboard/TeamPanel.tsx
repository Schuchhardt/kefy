'use client';

// ─── Equipo de la organización ───────────────────────────────────────────────
//
// La página de precios anuncia un número de miembros por plan. Hasta ahora no
// existía forma de invitar a nadie, así que ese límite ni se cumplía ni se
// podía alcanzar. Este panel es el flujo que faltaba.

import { useState, useEffect, useCallback, FormEvent } from 'react';

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

const COPY = {
  es: {
    seats: (used: number, limit: number) => `${used} de ${limit} ${limit === 1 ? 'lugar usado' : 'lugares usados'}`,
    invite: 'Invitar',
    inviting: 'Enviando…',
    emailPlaceholder: 'correo@ejemplo.com',
    roleMember: 'Miembro',
    roleAdmin: 'Administrador',
    roleOwner: 'Dueño',
    you: 'tú',
    pending: 'Invitaciones pendientes',
    expired: 'expirada',
    revoke: 'Revocar',
    remove: 'Eliminar',
    confirmRemove: (name: string) => `¿Eliminar a ${name} del equipo?`,
    emptyPending: 'No hay invitaciones pendientes.',
    planFull: 'Tu plan no admite más miembros. Mejora de plan para invitar a alguien más.',
    onlyManagers: 'Solo el dueño o un administrador pueden gestionar el equipo.',
    sentNoEmail: 'Invitación creada, pero no se pudo enviar el correo. Reenvíala más tarde.',
    loadError: 'No pudimos cargar el equipo.',
  },
  en: {
    seats: (used: number, limit: number) => `${used} of ${limit} ${limit === 1 ? 'seat used' : 'seats used'}`,
    invite: 'Invite',
    inviting: 'Sending…',
    emailPlaceholder: 'email@example.com',
    roleMember: 'Member',
    roleAdmin: 'Admin',
    roleOwner: 'Owner',
    you: 'you',
    pending: 'Pending invitations',
    expired: 'expired',
    revoke: 'Revoke',
    remove: 'Remove',
    confirmRemove: (name: string) => `Remove ${name} from the team?`,
    emptyPending: 'No pending invitations.',
    planFull: 'Your plan has no room for more members. Upgrade to invite someone else.',
    onlyManagers: 'Only the owner or an admin can manage the team.',
    sentNoEmail: 'Invitation created, but the email could not be sent. Resend it later.',
    loadError: "We couldn't load the team.",
  },
} as const;

export default function TeamPanel({ locale, role }: { locale: 'es' | 'en'; role: string }) {
  const t = COPY[locale];
  const puedeGestionar = role === 'owner' || role === 'admin';

  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [limit, setLimit] = useState(1);
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/team/members');
      if (!res.ok) throw new Error('members');
      const data = await res.json();
      setMembers(data.members ?? []);
      setLimit(data.limit ?? 1);
      setUsed(data.used ?? 0);

      if (puedeGestionar) {
        const inv = await fetch('/api/team/invitations');
        if (inv.ok) setInvitations((await inv.json()).invitations ?? []);
      }
    } catch {
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [puedeGestionar, t.loadError]);

  useEffect(() => { void load(); }, [load]);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/team/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role: inviteRole, lang: locale }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t.loadError);
        return;
      }
      // La invitación vale aunque el correo falle: el enlace se puede reenviar.
      if (data.emailSent === false) setNotice(t.sentNoEmail);
      setEmail('');
      await load();
    } catch {
      setError(t.loadError);
    } finally {
      setSending(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/team/invitations/${id}`, { method: 'DELETE' });
    await load();
  }

  async function removeMember(m: Member) {
    const nombre = m.name || m.email || '';
    if (!window.confirm(t.confirmRemove(nombre))) return;
    const res = await fetch(`/api/team/members/${m.userId}`, { method: 'DELETE' });
    if (!res.ok) setError((await res.json()).error ?? t.loadError);
    await load();
  }

  if (loading) return <p style={{ color: 'var(--muted)', fontSize: 13 }}>⏳</p>;

  const sinCupo = used >= limit;
  const roleLabel = (r: string) =>
    r === 'owner' ? t.roleOwner : r === 'admin' ? t.roleAdmin : t.roleMember;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{t.seats(used, limit)}</p>

      {/* Miembros */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {members.map((m) => (
          <div key={m.userId} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
          }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                {m.name || m.email}{m.isSelf && <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {t.you}</span>}
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                {m.email} · {roleLabel(m.role)}
              </p>
            </div>
            {puedeGestionar && !m.isSelf && m.role !== 'owner' && (
              <button className="btn btn-ghost btn-sm" onClick={() => void removeMember(m)}>
                {t.remove}
              </button>
            )}
          </div>
        ))}
      </div>

      {!puedeGestionar && (
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{t.onlyManagers}</p>
      )}

      {puedeGestionar && (
        <>
          {/* Invitar */}
          <form onSubmit={handleInvite} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.emailPlaceholder}
              disabled={sinCupo}
              style={{
                flex: '1 1 200px', background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13,
              }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as 'admin' | 'member')}
              disabled={sinCupo}
              style={{
                background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '9px 12px', color: 'var(--text)', fontSize: 13,
              }}
            >
              <option value="member">{t.roleMember}</option>
              <option value="admin">{t.roleAdmin}</option>
            </select>
            <button className="btn btn-primary btn-sm" type="submit" disabled={sending || sinCupo}>
              {sending ? t.inviting : t.invite}
            </button>
          </form>

          {sinCupo && (
            <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{t.planFull}</p>
          )}
          {error && <p style={{ fontSize: 12, color: '#ff8c42', margin: 0 }}>{error}</p>}
          {notice && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>{notice}</p>}

          {/* Pendientes */}
          <div>
            <p style={{
              fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8,
              textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              {t.pending}
            </p>
            {invitations.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>{t.emptyPending}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {invitations.map((inv) => (
                  <div key={inv.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 13, margin: 0 }}>{inv.email}</p>
                      <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
                        {roleLabel(inv.role)}{inv.expired && ` · ${t.expired}`}
                      </p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => void revoke(inv.id)}>
                      {t.revoke}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
