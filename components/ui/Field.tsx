'use client';

// ─── Campos de formulario ────────────────────────────────────────────────────
//
// `Field` une etiqueta, control, ayuda y error con `useId`: antes 12 de los 16
// archivos con inputs no tenían ni un `htmlFor`, así que los lectores de
// pantalla anunciaban «campo de texto» sin decir cuál.
//
// Uso:
//   <Field label="Nombre" hint="Como aparecerá en tus posts">
//     <Input value={name} onChange={…} />
//   </Field>
// o, para controles propios, con función:
//   <Field label="Fuente">{(p) => <GoogleFontSelect id={p.id} … />}</Field>

import {
  cloneElement, forwardRef, isValidElement, useId,
  type InputHTMLAttributes, type ReactElement, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Id del control, si ya tiene uno. */
  id?: string;
  className?: string;
  /** Oculta la etiqueta a la vista (sigue siendo el nombre accesible). */
  hideLabel?: boolean;
  children: ReactElement | ((props: FieldControlProps) => ReactNode);
}

export function Field({ label, hint, error, required, id, className, hideLabel, children }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? `f${autoId.replace(/:/g, '')}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const controlProps: FieldControlProps = {
    id: controlId,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(error ? { 'aria-invalid': true as const } : {}),
    ...(required ? { 'aria-required': true as const } : {}),
  };

  let control: ReactNode;
  if (typeof children === 'function') {
    control = children(controlProps);
  } else if (isValidElement(children)) {
    control = cloneElement(children as ReactElement<Record<string, unknown>>, controlProps as unknown as Record<string, unknown>);
  } else {
    control = children;
  }

  return (
    <div className={['ui-field', className].filter(Boolean).join(' ')}>
      <label htmlFor={controlId} className={hideLabel ? 'sr-only' : 'ui-label'}>
        {label}
        {required && <span className="ui-required" aria-hidden="true">*</span>}
      </label>
      {control}
      {hint && <p id={hintId} className="ui-hint">{hint}</p>}
      {error && <p id={errorId} className="ui-error" role="alert">{error}</p>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={['ui-input', className].filter(Boolean).join(' ')} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...rest }, ref) {
    return <textarea ref={ref} className={['ui-input', className].filter(Boolean).join(' ')} {...rest} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...rest }, ref) {
    return <select ref={ref} className={['ui-input', className].filter(Boolean).join(' ')} {...rest} />;
  },
);
