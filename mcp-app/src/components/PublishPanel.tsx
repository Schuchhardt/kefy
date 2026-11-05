// Publicar o programar desde la tarjeta: carga las cuentas reales de la marca
// (list_social_accounts), deja elegir cuentas y «ahora» o fecha-hora, y antes
// del botón final lista las cuentas destino con nombre y red. Publicar ahora es
// irreversible: siempre pasa por ese paso de revisión.

import { useEffect, useId, useState } from 'react';
import { CHANNEL_LABELS } from '@/lib/channels';
import type { Channel } from '@/types/channels';
import { useEnv } from '../context';
import type { ToolOutcome } from '../host';
import { defaultScheduleValue, formatDateTime, scheduleIso } from '../format';
import { Button, Field, Notice, Panel, Spinner } from './ui';
import type { Call } from './panels';

interface Account { id: string; platform: string; username: string | null; status: string }

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

  useEffect(() => {
    let alive = true;
    void call('list_social_accounts', {}).then((r) => {
      if (!alive) return;
      if (!r.ok) { setLoadError(`${r.code}: ${r.message}`); return; }
      const list = ((r.data as { accounts?: Account[] } | null)?.accounts ?? []).filter((a) => a && typeof a.id === 'string');
      setAccounts(list);
      const active = list.filter((a) => a.status === 'active');
      if (active.length === 1) setSelected([active[0].id]);
    });
    return () => { alive = false; };
  }, [call]);

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
              return (
                <label key={a.id} className={`k-check${active ? '' : ' is-disabled'}`}>
                  <input type="checkbox" disabled={!active} checked={selected.includes(a.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, a.id] : s.filter((x) => x !== a.id)))} />
                  <span>{accountName(a)}</span>
                  <span className="k-muted">{networkLabel(a.platform)}{active ? '' : ` · ${t.publish.inactive}`}</span>
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
