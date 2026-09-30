'use client';

// ─── Calendario de publicaciones ─────────────────────────────────────────────
//
// Escritorio: rejilla del mes. Cada día es un botón con nombre («martes, 30 de
// septiembre, 2 publicaciones»): los que tienen publicaciones muestran su
// detalle debajo; uno vacío abre un panel con «Crear contenido» o «Programar
// un contenido existente» (antes abría directamente el modal de programar).
//
// Móvil: la rejilla de 7 columnas no cabe (celdas de ~37px), así que se
// muestra la agenda del mes: lo programado agrupado por día, con acceso a
// cada contenido.

import { useEffect, useState, useCallback, useMemo, useId } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ChannelIcon from '@/components/ui/ChannelIcon';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import Button, { ButtonLink } from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Notice from '@/components/ui/Notice';
import EmptyState from '@/components/ui/EmptyState';
import StatusBadge from '@/components/ui/StatusBadge';
import Icon from '@/components/ui/icons';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import { useDataChanged } from '@/lib/data-events';
import { useBrand } from '@/lib/brand-context';
import { statusColors, TONE_COLORS } from '@/lib/status';
import { toLocale } from '@/lib/i18n';
import ScheduleModal from '@/components/dashboard/content/ScheduleModal';
import { NET_LABEL } from '@/components/dashboard/NetworkPreview';
import type { PostStatus, ScheduledPost } from '@/types/content';
import type { SocialAccount } from '@/types/social';

import esT from '@/locales/es/dashboard/calendar';
import enT from '@/locales/en/dashboard/calendar';
import esCommon from '@/locales/es/dashboard/common';
import enCommon from '@/locales/en/dashboard/common';
import styles from './page.module.css';

const T = { es: esT, en: enT } as const;
const COMMON = { es: esCommon, en: enCommon } as const;

const LEGEND: PostStatus[] = ['scheduled', 'published', 'failed', 'pending'];

/** Clave local `YYYY-MM-DD` de una fecha. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Activa en tono de acento; caducada o revocada (hay que reconectarla) en aviso. */
function accountBadgeStyle(status: string): React.CSSProperties {
  const tone = TONE_COLORS[status === 'active' ? 'accent' : 'warning'];
  return { ['--badge-color' as string]: tone.color, ['--badge-bg' as string]: tone.background };
}

/** Fecha (a mediodía, para no cruzar de día con el huso) de una clave `YYYY-MM-DD`. */
function keyToDate(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

export default function CalendarPage() {
  const { lang: rawLang } = useParams<{ lang: string }>();
  const { activeBrand } = useBrand();
  const lang = toLocale(rawLang);
  const t = T[lang];
  const common = COMMON[lang];
  const locale = lang === 'en' ? 'en-US' : 'es-ES';
  const { confirm, dialog } = useConfirm();
  const monthHeadingId = useId();
  const dayHeadingId = useId();

  const today = useMemo(() => new Date(), []);
  const todayKey = dayKey(today);
  const [posts, setPosts]         = useState<ScheduledPost[]>([]);
  /** `null` mientras no se sabe (carga o error): no hay que avisar «sin cuentas». */
  const [accounts, setAccounts]   = useState<SocialAccount[] | null>(null);
  const [loading, setLoading]     = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Calendar navigation
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  /** Día vacío cuyo panel («Crear» / «Programar») está abierto. */
  const [emptyDay, setEmptyDay] = useState<string | null>(null);

  // ScheduleModal
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleInitialDate, setScheduleInitialDate] = useState<Date | undefined>(undefined);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [postsRes, accountsRes] = await Promise.all([
        fetch('/api/social/schedule?limit=100', { credentials: 'include' }),
        fetch('/api/social/accounts', { credentials: 'include' }),
      ]);
      if (!postsRes.ok) throw new Error(`schedule ${postsRes.status}`);
      const postsData = await postsRes.json() as { posts?: ScheduledPost[] };
      setPosts(postsData.posts ?? []);
      if (accountsRes.ok) {
        const accountsData = await accountsRes.json() as { accounts?: SocialAccount[] };
        setAccounts(accountsData.accounts ?? []);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // Cambiar de marca activa no disparaba por sí solo un refetch (mismo bug
  // que en /content/create): la cookie httpOnly cambia pero el cliente se
  // queda con las publicaciones/cuentas de la marca anterior hasta que algo
  // más refresque de casualidad. Cerrar el modal de programar evita que se
  // quede abierto mostrando un post de la marca que se acaba de dejar.
  useEffect(() => {
    if (!activeBrand?.id) return;
    void fetchData();
    setScheduleModalOpen(false);
    setEmptyDay(null);
  }, [activeBrand?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // El asistente publicó, programó o canceló: se recarga el calendario.
  useDataChanged(['scheduled', 'content'], () => { void fetchData(); });

  const postsByDay = useMemo(() => {
    const map: Record<string, ScheduledPost[]> = {};
    for (const post of posts) {
      if (!post.scheduled_at) continue;
      const key = dayKey(new Date(post.scheduled_at));
      if (!map[key]) map[key] = [];
      map[key].push(post);
    }
    for (const list of Object.values(map)) {
      list.sort((a, b) => (a.scheduled_at ?? '').localeCompare(b.scheduled_at ?? ''));
    }
    return map;
  }, [posts]);

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay();
  const startOffset     = (firstDayOfMonth + 6) % 7;
  const daysInMonth     = new Date(viewYear, viewMonth + 1, 0).getDate();
  const totalCells      = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  const monthName       = t.monthNames[viewMonth];
  const isCurrentMonth  = viewYear === today.getFullYear() && viewMonth === today.getMonth();

  const monthKeyPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-`;
  const agendaDays = useMemo(
    () => Object.keys(postsByDay).filter((k) => k.startsWith(monthKeyPrefix)).sort(),
    [postsByDay, monthKeyPrefix],
  );

  function goToMonth(year: number, month: number) {
    setViewYear(year);
    setViewMonth(month);
    setSelectedDate(null);
  }
  function goToPrevMonth() {
    if (viewMonth === 0) goToMonth(viewYear - 1, 11);
    else goToMonth(viewYear, viewMonth - 1);
  }
  function goToNextMonth() {
    if (viewMonth === 11) goToMonth(viewYear + 1, 0);
    else goToMonth(viewYear, viewMonth + 1);
  }
  function goToToday() {
    goToMonth(today.getFullYear(), today.getMonth());
  }

  const selectedDayPosts = selectedDate ? (postsByDay[selectedDate] ?? []) : [];

  function openScheduleForDay(key: string) {
    const d = keyToDate(key);
    d.setHours(9, 0, 0, 0);
    if (d.getTime() < Date.now()) d.setTime(Date.now() + 60 * 60 * 1000);
    setScheduleInitialDate(d);
    setScheduleModalOpen(true);
  }

  function openScheduleGeneric() {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    setScheduleInitialDate(d);
    setScheduleModalOpen(true);
  }

  function handleDayClick(key: string) {
    if (loading) return;
    if ((postsByDay[key] ?? []).length === 0) {
      setEmptyDay(key);
      return;
    }
    setSelectedDate((prev) => (prev === key ? null : key));
  }

  async function handleCancel(post: ScheduledPost) {
    const ok = await confirm({
      title: t.cancelConfirmTitle,
      message: t.cancelConfirmMessage,
      confirmLabel: t.cancelPost,
      cancelLabel: t.cancelKeep,
      danger: true,
    });
    if (!ok) return;
    setActionError(null);
    try {
      const res = await fetch(`/api/social/schedule/${post.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      if (!res.ok) throw new Error(`cancel ${res.status}`);
    } catch {
      setActionError(t.cancelError);
    }
    void fetchData();
  }

  const formatDay = (key: string, withYear = false) => keyToDate(key).toLocaleDateString(locale, {
    weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' as const } : {}),
  });

  function renderPost(post: ScheduledPost) {
    const text = post.kefy_content_items?.body?.slice(0, 80) || post.kefy_content_items?.title || t.noText;
    const contentId = post.kefy_content_items?.id;
    const platform = post.kefy_social_accounts?.platform;
    const account = post.kefy_social_accounts?.username ? `@${post.kefy_social_accounts.username}` : t.unknownAccount;
    const time = post.scheduled_at
      ? new Date(post.scheduled_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
      : '--:--';
    return (
      <li key={post.id} className={styles.post}>
        <span className={styles.postTime}>{time}</span>
        <span className={styles.postIcon} aria-hidden="true">
          <ChannelIcon name={platform ?? ''} size={20} />
        </span>
        <div className={styles.postMain}>
          {contentId ? (
            <Link href={`/${lang}/dashboard/content/${contentId}`} className={styles.postText}>{text}</Link>
          ) : (
            <p className={styles.postText}>{text}</p>
          )}
          <p className={styles.postMeta}>
            {platform ? `${account} · ${NET_LABEL[platform] ?? platform}` : account}
          </p>
          {post.error_message && <p className={styles.postError}>{post.error_message}</p>}
        </div>
        <div className={styles.postSide}>
          <StatusBadge status={post.status} lang={lang} />
          {post.status === 'scheduled' && (
            <Button variant="ghost" size="sm" onClick={() => void handleCancel(post)}>
              {t.cancelPost}
            </Button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 960 }}>
      <header className="page-header">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: 'var(--font-syne), system-ui, sans-serif' }}>{t.title}</h1>
          <p>{t.subtitle}</p>
        </div>
        <div className="page-header-actions">
          <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={openScheduleGeneric}>
            {t.scheduleBtn}
          </Button>
        </div>
      </header>

      {loadError && (
        <div className={styles.notice}>
          <Notice tone="danger">
            {t.loadError}{' '}
            <Button variant="ghost" size="sm" icon={<Icon name="refresh" size={14} />} onClick={() => void fetchData()}>
              {t.retry}
            </Button>
          </Notice>
        </div>
      )}
      {actionError && <div className={styles.notice}><Notice tone="danger">{actionError}</Notice></div>}

      {/* Connected accounts */}
      {accounts && accounts.length > 0 && (
        <ul className={styles.accounts} aria-label={t.accountsLabel}>
          {accounts.map((acc) => (
            <li key={acc.id} className={styles.account}>
              <span className={styles.accountIcon} aria-hidden="true">
                <ChannelIcon name={acc.platform} size={16} />
              </span>
              <span className={styles.accountName}>@{acc.username}</span>
              {acc.status && (
                <span className="ui-badge" style={accountBadgeStyle(acc.status)}>
                  {t.accountStatus[acc.status] ?? acc.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* No accounts warning */}
      {!loading && accounts !== null && accounts.length === 0 && (
        <div className={styles.notice}>
          <Notice tone="warning" live={false} icon={<Icon name="link" size={16} />}>
            <strong>{t.noAccounts}</strong> {t.noAccountsHint}{' '}
            <Link href={`/${lang}/dashboard/settings#social`}>{t.noAccountsLink}</Link>
          </Notice>
        </div>
      )}

      {/* ── Calendar ──────────────────────────────────────────────────────── */}
      <section className={styles.calendar} aria-labelledby={monthHeadingId}>
        {/* Month navigation */}
        <div className={styles.monthNav}>
          <Button
            variant="secondary"
            iconOnly
            aria-label={t.prevMonth}
            icon={<Icon name="chevron-left" size={18} />}
            onClick={goToPrevMonth}
          />
          <div className={styles.monthCenter}>
            <h2 id={monthHeadingId} className={styles.monthTitle} aria-live="polite">
              {monthName} {viewYear}
            </h2>
            {!isCurrentMonth && (
              <Button variant="secondary" onClick={goToToday}>{t.today}</Button>
            )}
          </div>
          <Button
            variant="secondary"
            iconOnly
            aria-label={t.nextMonth}
            icon={<Icon name="chevron-right" size={18} />}
            onClick={goToNextMonth}
          />
        </div>

        {/* Desktop: status legend + month grid */}
        <div className={styles.desktopOnly}>
          <ul className={styles.legend} aria-label={t.legendLabel}>
            {LEGEND.map((s) => (
              <li key={s} className={styles.legendItem}>
                <span className={styles.dot} style={{ background: statusColors(s).color }} aria-hidden="true" />
                {common.status[s]}
              </li>
            ))}
          </ul>

          <div className={styles.weekdays} aria-hidden="true">
            {t.dayNames.map((day) => (
              <div key={day} className={styles.weekday}>{day}</div>
            ))}
          </div>

          <div className={styles.grid}>
            {Array.from({ length: totalCells }, (_, i) => {
              const dayNum = i - startOffset + 1;
              if (dayNum < 1 || dayNum > daysInMonth) {
                return <div key={i} className={`${styles.cell} ${styles.cellPad}`} aria-hidden="true" />;
              }
              const key = `${monthKeyPrefix}${String(dayNum).padStart(2, '0')}`;
              if (loading) {
                return (
                  <div key={i} className={`${styles.cell} ${styles.cellSkeleton}`}>
                    <SkeletonBlock width={26} height={26} borderRadius={13} />
                  </div>
                );
              }
              const dayPosts   = postsByDay[key] ?? [];
              const isToday    = key === todayKey;
              const isSelected = key === selectedDate;
              return (
                <div key={i} className={styles.cell}>
                  <button
                    type="button"
                    className={styles.dayBtn}
                    onClick={() => handleDayClick(key)}
                    aria-label={t.dayLabel(formatDay(key), dayPosts.length)}
                    aria-current={isToday ? 'date' : undefined}
                    aria-pressed={dayPosts.length > 0 ? isSelected : undefined}
                    aria-haspopup={dayPosts.length === 0 ? 'dialog' : undefined}
                  >
                    <span className={`${styles.dayNum} ${isToday ? styles.dayNumToday : ''}`}>{dayNum}</span>
                    {dayPosts.length > 0 && (
                      <span className={styles.dayDots} aria-hidden="true">
                        {dayPosts.slice(0, 4).map((post) => (
                          <span key={post.id} className={styles.dot} style={{ background: statusColors(post.status).color }} />
                        ))}
                        {dayPosts.length > 4 && <span className={styles.more}>{t.morePosts(dayPosts.length - 4)}</span>}
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Mobile: agenda of the month */}
        <div className={styles.agenda}>
          {loading ? (
            <div className={styles.agendaSkeleton}>
              <SkeletonBlock width="40%" height={14} />
              <SkeletonBlock height={64} borderRadius={10} />
              <SkeletonBlock height={64} borderRadius={10} />
            </div>
          ) : agendaDays.length === 0 ? (
            <EmptyState
              compact
              icon={<Icon name="calendar" size={28} />}
              title={t.agendaEmpty(monthName)}
              hint={t.agendaEmptyHint}
              action={(
                <div className={styles.emptyActions}>
                  <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={openScheduleGeneric}>
                    {t.scheduleBtn}
                  </Button>
                  <ButtonLink href={`/${lang}/dashboard/content/create?new=1`} variant="secondary" icon={<Icon name="sparkles" size={16} />}>
                    {t.createContent}
                  </ButtonLink>
                </div>
              )}
            />
          ) : (
            <ol className={styles.agendaDays} aria-label={t.agendaLabel(monthName)}>
              {agendaDays.map((key) => (
                <li key={key}>
                  <h3 className={styles.agendaDate}>
                    <span className={styles.capitalize}>{formatDay(key)}</span>
                    {key === todayKey && <span className="ui-badge">{t.today}</span>}
                  </h3>
                  <ul className={styles.posts}>
                    {postsByDay[key].map(renderPost)}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* ── Day detail (desktop) ─────────────────────────────────────────── */}
      <div className={styles.desktopOnly}>
        {selectedDate === null ? (
          posts.length > 0 && !loading && <p className={styles.hint}>{t.selectDayHint}</p>
        ) : (
          <section className={styles.dayDetail} aria-labelledby={dayHeadingId}>
            <div className={styles.dayDetailHead}>
              <h2 id={dayHeadingId} className={styles.dayDetailTitle}>{formatDay(selectedDate, true)}</h2>
              <Button
                variant="secondary"
                size="sm"
                icon={<Icon name="plus" size={14} />}
                onClick={() => openScheduleForDay(selectedDate)}
              >
                {t.scheduleOnDay}
              </Button>
            </div>
            <ul className={styles.posts}>
              {selectedDayPosts.map(renderPost)}
            </ul>
          </section>
        )}
      </div>

      {/* ── Empty day panel ──────────────────────────────────────────────── */}
      <Modal
        open={emptyDay !== null}
        onClose={() => setEmptyDay(null)}
        title={emptyDay ? <span className={styles.capitalize}>{formatDay(emptyDay, true)}</span> : ''}
        maxWidth={540}
        footer={emptyDay && (
          <>
            <ButtonLink
              href={`/${lang}/dashboard/content/create?new=1`}
              variant="secondary"
              icon={<Icon name="sparkles" size={16} />}
            >
              {t.createContent}
            </ButtonLink>
            <Button
              variant="primary"
              icon={<Icon name="calendar" size={16} />}
              onClick={() => {
                const key = emptyDay;
                setEmptyDay(null);
                openScheduleForDay(key);
              }}
            >
              {t.scheduleExisting}
            </Button>
          </>
        )}
      >
        <EmptyState
          compact
          icon={<Icon name="calendar" size={28} />}
          title={t.emptyDayTitle}
          hint={emptyDay && emptyDay < todayKey ? t.emptyPastDayHint : t.emptyDayHint}
        />
      </Modal>

      <ScheduleModal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        initialDate={scheduleInitialDate}
        lang={lang}
        showCalendarLink={false}
        onSuccess={() => { void fetchData(); }}
      />

      {dialog}
    </div>
  );
}
