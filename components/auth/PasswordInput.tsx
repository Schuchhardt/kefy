'use client';

// Campo de contraseña con botón para verla. En móvil, escribir una contraseña
// a ciegas con el teclado táctil es la primera causa de «contraseña
// incorrecta» en el login.

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import Icon from '@/components/ui/icons';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  showLabel: string;
  hideLabel: string;
}

const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { showLabel, hideLabel, className, ...rest }, ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-password">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={['auth-input', className].filter(Boolean).join(' ')}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        {...rest}
      />
      <button
        type="button"
        className="auth-password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? hideLabel : showLabel}
        aria-pressed={visible}
        aria-controls={rest.id}
      >
        <Icon name={visible ? 'eye-off' : 'eye'} size={18} />
      </button>
    </div>
  );
});

export default PasswordInput;
