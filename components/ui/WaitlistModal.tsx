'use client';

import { useState, useRef, useEffect } from 'react';
import type { WaitlistCopy } from '@/types/locales';

interface WaitlistModalProps {
  copy: WaitlistCopy;
  isOpen: boolean;
  onClose: () => void;
  initialEmail?: string;
}

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function WaitlistModal({ copy, isOpen, onClose, initialEmail }: WaitlistModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [interest, setInterest] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      if (initialEmail) setEmail(initialEmail);
      setTimeout(() => emailRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, initialEmail]);

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStatus('idle');
        setName('');
        setEmail('');
        setInterest('');
        setErrorMsg('');
      }, 300);
    }
  }, [isOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (isOpen) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');
    setErrorMsg('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || null,
          interest: interest || null,
          lang: navigator.language,
        }),
      });

      if (res.ok) {
        setStatus('success');
      } else if (res.status === 409) {
        setStatus('error');
        setErrorMsg(copy.errorDuplicate);
      } else {
        setStatus('error');
        setErrorMsg(copy.errorGeneric);
      }
    } catch {
      setStatus('error');
      setErrorMsg(copy.errorGeneric);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      className="wl-backdrop"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wl-title"
    >
      <div className="wl-modal">
        <button
          className="wl-close"
          onClick={onClose}
          aria-label="Cerrar"
        >
          ✕
        </button>

        {status === 'success' ? (
          <div className="wl-success">
            <div className="wl-success-icon">🎉</div>
            <h2 className="wl-success-title">{copy.successTitle}</h2>
            <p className="wl-success-sub">{copy.successSub}</p>
            <button className="btn btn-primary btn-lg" onClick={onClose}>
              OK
            </button>
          </div>
        ) : (
          <>
            <div className="wl-head">
              <h2 id="wl-title" className="wl-title">{copy.title}</h2>
              <p className="wl-subtitle">{copy.subtitle}</p>
            </div>

            <form className="wl-form" onSubmit={handleSubmit} noValidate>
              <div className="wl-field">
                <label className="wl-label" htmlFor="wl-email">
                  {copy.emailLbl} <span className="wl-required">*</span>
                </label>
                <input
                  ref={emailRef}
                  id="wl-email"
                  type="email"
                  className="wl-input"
                  placeholder={copy.emailPlaceholder}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={status === 'loading'}
                />
              </div>

              <div className="wl-field">
                <label className="wl-label" htmlFor="wl-name">
                  {copy.nameLbl}
                </label>
                <input
                  id="wl-name"
                  type="text"
                  className="wl-input"
                  placeholder={copy.namePlaceholder}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  disabled={status === 'loading'}
                />
              </div>

              <div className="wl-field">
                <label className="wl-label" htmlFor="wl-interest">
                  {copy.interestLbl}
                </label>
                <select
                  id="wl-interest"
                  className="wl-input wl-select"
                  value={interest}
                  onChange={(e) => setInterest(e.target.value)}
                  disabled={status === 'loading'}
                >
                  <option value="">{copy.interestPlaceholder}</option>
                  {copy.interestOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {status === 'error' && (
                <p className="wl-error" role="alert">{errorMsg}</p>
              )}

              <button
                type="submit"
                className="btn btn-primary btn-lg wl-submit"
                disabled={status === 'loading' || !email.trim()}
              >
                {status === 'loading' ? copy.submitting : copy.submit}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
