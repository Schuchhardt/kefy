// Publicar o programar desde la tarjeta: carga las cuentas reales de la marca
// (list_social_accounts), deja elegir cuentas y «ahora» o fecha-hora, y antes
// del botón final lista las cuentas destino con nombre y red. Publicar ahora es
// irreversible: siempre pasa por ese paso de revisión.
//
// list_publish_targets dice en qué cuentas ya está el contenido (en este
// formato) y cuáles no admiten el formato: esas no se pueden marcar. Así un
// contenido publicado o programado se lleva a las cuentas que faltan. Si la
// herramienta falla, el selector funciona como antes.

import { useEffect, useId, useState } from 'react';
import { CHANNEL_LABELS } from '@/lib/channels';
import type { Channel } from '@/types/channels';
import { useEnv } from '../context';
import type { ToolOutcome } from '../host';
import { defaultScheduleValue, formatDateTime, scheduleIso } from '../format';
import { Button, Field, Notice, Panel, Spinner } from './ui';
import type { Call } from './panels';

interface Account { id: string; platform: string; username: string | null; status: string }

/** Lo que importa de list_publish_targets para el selector. */
interface Target { social_account_id: string; state: string; issue?: string; max_images?: number }

export interface PublishOutcome {
  mode: 'now' | 'schedule';
  ok: number;
  failed: number;
  when: string | null;
}

function accountName(a: Account): string {
  const user = a.username ? (a.username.startsWith('@') ? a.username : `@${a.username}`) : a.id.slice(0, 8);
  return user;
}

function networkLabel(platform: string): string {
  return CHANNEL_LABELS[platform as Channel] ?? platform;
}

/** Ya tiene el contenido en este formato, o su red no lo admite. */
function blockedBy(tg: Target | undefined): boolean {
  return !!tg && (tg.state === 'published' || tg.state === 'scheduled' || tg.state === 'incompatible');
}

type PublishCopy = ReturnType<typeof useEnv>['t']['publish'];

function targetNote(tg: Target, t: PublishCopy): string {
  if (tg.state === 'published') return t.alreadyPublished;
  if (tg.state === 'scheduled') return t.alreadyScheduled;
  if (tg.issue === 'too_many_images') return t.issues.too_many_images(tg.max_images ?? 1);
  return t.issues[tg.issue as keyof Omit<PublishCopy['issues'], 'too_many_images'>] ?? t.notCompatible;
}

export function PublishPanel({
  itemId, format, call, onClose, onPublished, onError,
}: {
  itemId: string;
  /** Formato a publicar si no es el propio de la pieza (rendición). */
  format?: string | null;
  call: Call;
  onClose: () => void;
  onPublished: (r: PublishOutcome) => void;
  onError: (r: Extract<ToolOutcome, { ok: false }>) => void;
}) {
  const { t, locale, timeZone } = useEnv();
  const id = useId();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<'now' | 'schedule'>('now');
  const [local, setLocal] = useState(defaultScheduleValue());
  const [step, setStep] = useState<'pick' | 'review'>('pick');
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [targets, setTargets] = useState<Map<string, Target>>(new Map());

  useEffect(() => {
    let alive = true;
    void Promise.all([
      call('list_social_accounts', {}),
      call('list_publish_targets', { item_id: itemId, ...(format ? { format } : {}) }),
    ]).then(([r, tr]) => {
      if (!alive) return;
      if (!r.ok) { setLoadError(`${r.code}: ${r.message}`); return; }
      const list = ((r.data as { accounts?: Account[] } | null)?.accounts ?? []).filter((a) => a && typeof a.id === 'string');
      const byId = new Map<string, Target>();
      if (tr.ok) {
        for (const tg of ((tr.data as { targets?: Target[] } | null)?.targets ?? [])) {
          if (tg && typeof tg.social_account_id === 'string') byId.set(tg.social_account_id, tg);
        }
      }
      setAccounts(list);
      setTargets(byId);
      const pickable = list.filter((a) => a.status === 'active' && !blockedBy(byId.get(a.id)));
      if (pickable.length === 1) setSelected([pickable[0].id]);
    });
    return () => { alive = false; };
  }, [call, itemId, format]);

  const iso = mode === 'schedule' ? scheduleIso(local) : null;
  const chosen = (accounts ?? []).filter((a) => selected.includes(a.id));

  const next = () => {
    if (!selected.length) return setProblem(t.publish.pickAccount);
    if (mode === 'schedule' && !iso) return setProblem(t.publish.tooSoon);
    setProblem(null);
    setStep('review');
  };

  const submit = async () => {
    setBusy(true);
    const r = await call('publish_content', {
      item_id: itemId,
      social_account_ids: selected,
      when: mode === 'now' ? 'now' : iso,
      ...(format ? { format } : {}),
    });
    setBusy(false);
    if (!r.ok) return onError(r);
    const results = ((r.data as { results?: Array<{ status: string }> } | null)?.results ?? []);
    const failed = results.filter((x) => x.status === 'failed').length;
    onPublished({ mode, ok: results.length - failed, failed, when: iso });
  };

  return (
    <Panel title={t.publish.title} onClose={onClose}>
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}
      {!accounts && !loadError ? <p className="k-help"><Spinner /> {t.publish.loadingAccounts}</p> : null}
      {accounts && accounts.length === 0 ? <Notice tone="warning">{t.publish.noAccounts}</Notice> : null}

      {accounts && accounts.length > 0 && step === 'pick' ? (
        <form onSubmit={(e) => { e.preventDefault(); next(); }}>
          <fieldset className="k-fieldset">
            <legend>{t.publish.accounts}</legend>
            {accounts.map((a) => {
              const active = a.status === 'active';
              const blocked = blockedBy(targets.get(a.id));
              const note = !active ? t.publish.inactive : blocked ? targetNote(targets.get(a.id)!, t.publish) : null;
              return (
                <label key={a.id} className={`k-check${active && !blocked ? '' : ' is-disabled'}`}>
                  <input type="checkbox" disabled={!active || blocked} checked={selected.includes(a.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))} />
                  <span>{accountName(a)}</span>
                  <span className="k-muted">{networkLabel(a.platform)}{note ? ` · ${note}` : ''}</span>
                </label>
              );
            })}
          </fieldset>
          <fieldset className="k-fieldset">
            <legend>{t.publish.when}</legend>
            <label className="k-check">
              <input type="radio" name={`${id}-when`} checked={mode === 'now'} onChange={() => setMode('now')} />
              <span>{t.publish.now}</span>
            </label>
            <label className="k-check">
              <input type="radio" name={`${id}-when`} checked={mode === 'schedule'} onChange={() => setMode('schedule')} />
              <span>{t.publish.schedule}</span>
            </label>
            {mode === 'schedule' ? (
              <Field label={t.publish.dateTime} htmlFor={`${id}-dt`}>
                <input id={`${id}-dt`} type="datetime-local" value={local} onChange={(e) => setLocal(e.target.value)} />
              </Field>
            ) : null}
          </fieldset>
          {problem ? <Notice tone="warning">{problem}</Notice> : null}
          <div className="k-row">
            <Button type="submit" variant="primary">{t.publish.next}</Button>
            <Button variant="ghost" onClick={onClose}>{t.cancel}</Button>
          </div>
        </form>
      ) : null}

      {step === 'review' ? (
        <div className="k-confirm" role="group" aria-label={t.publish.review}>
          <p className="k-confirm__title">{t.publish.review}</p>
          <p>{mode === 'now' ? t.publish.reviewNow : t.publish.reviewScheduled(formatDateTime(iso, locale, timeZone))}</p>
          <ul className="k-list">
            {chosen.map((a) => <li key={a.id}><strong>{accountName(a)}</strong> · {networkLabel(a.platform)}</li>)}
          </ul>
          {mode === 'now' ? <Notice tone="warning">{t.publish.irreversible}</Notice> : null}
          <div className="k-row">
            <Button variant="primary" icon="send" busy={busy} onClick={() => void submit()}>
              {mode === 'now' ? t.publish.submitNow : t.publish.submitScheduled}
            </Button>
            <Button variant="ghost" onClick={() => setStep('pick')} disabled={busy}>{t.cancel}</Button>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
