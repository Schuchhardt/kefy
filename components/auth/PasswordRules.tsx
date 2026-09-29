'use client';

// Reglas de la contraseña, comprobadas mientras se escribe. Antes el registro
// no decía que hacían falta 8 caracteres hasta que fallaba el envío.

import Icon from '@/components/ui/icons';
import esAuth from '@/locales/es/auth';
import enAuth from '@/locales/en/auth';

export default function PasswordRules({ id, lang, password, confirm }: {
  id: string;
  lang: string;
  password: string;
  /** Si se pasa, añade la regla «las dos coinciden». */
  confirm?: string;
}) {
  const t = (lang === 'en' ? enAuth : esAuth).passwordRules;
  const rules = [{ key: 'min', label: t.minLength, met: password.length >= 8 }];
  if (confirm !== undefined) {
    rules.push({ key: 'match', label: t.match, met: confirm.length > 0 && confirm === password });
  }

  return (
    <ul id={id} className="auth-rules" aria-label={t.title}>
      {rules.map((rule) => (
        <li key={rule.key} data-met={rule.met}>
          {rule.met
            ? <Icon name="check" size={14} />
            : <span aria-hidden="true" className="auth-rules-dot" />}
          <span>{rule.label}</span>
          <span className="sr-only"> ({rule.met ? t.met : t.unmet})</span>
        </li>
      ))}
    </ul>
  );
}
