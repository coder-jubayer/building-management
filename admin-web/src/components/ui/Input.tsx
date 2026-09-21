import type { InputHTMLAttributes } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
}

export function Input({ label, hint, id, className = '', ...props }: Props) {
  const inputId = id || props.name;
  return (
    <div className="field">
      {label ? <label htmlFor={inputId}>{label}</label> : null}
      <input id={inputId} className={`input ${className}`.trim()} {...props} />
      {hint ? <span className="faint" style={{ fontSize: 12 }}>{hint}</span> : null}
    </div>
  );
}
