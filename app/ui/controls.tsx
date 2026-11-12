// Small building blocks shared by the panels and dialogs.

import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';

// --- Icons (inline, so they follow the text colour) --------------------------

const ICON_PATHS: Record<string, string> = {
  settings:
    'M4 6h9M17 6h3M13 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 12h3M11 12h9M7 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0M4 18h11M19 18h1M15 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0',
  close: 'M6 6l12 12M18 6L6 18',
  assistant: 'M4 5h16v11H9l-5 4V5zM8 9h8M8 12h5',
  help: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM9.4 9.5a2.7 2.7 0 1 1 3.7 2.5c-.7.3-1.1.8-1.1 1.5v.5M12 17h.01',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0-13v3m0 12v3M3 12h3m12 0h3',
  chevron: 'M6 9l6 6 6-6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  trash: 'M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13',
  wind: 'M3 9h10a3 3 0 1 0-3-3M3 15h14a3 3 0 1 1-3 3M3 12h17',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-10v6m0-9h.01',
  panel: 'M4 5h16v14H4zM10 5v14',
};

export function Icon({ name, size = 18 }: { name: keyof typeof ICON_PATHS | string; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={ICON_PATHS[name] ?? ''} />
    </svg>
  );
}

// --- Buttons -------------------------------------------------------------------

interface ButtonProps {
  onClick?: () => void;
  children: ComponentChildren;
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
  testId?: string;
  type?: 'button' | 'submit';
  wide?: boolean;
}

export function Button({ onClick, children, kind = 'secondary', disabled, title, testId, type = 'button', wide }: ButtonProps) {
  return (
    <button type={type} class={`btn btn-${kind}${wide ? ' btn-wide' : ''}`} onClick={onClick} disabled={disabled} title={title} data-testid={testId}>
      {children}
    </button>
  );
}

export function IconButton({ icon, label, onClick, testId, active }: { icon: string; label: string; onClick: () => void; testId?: string; active?: boolean }) {
  return (
    <button type="button" class={`icon-btn${active ? ' is-active' : ''}`} onClick={onClick} title={label} aria-label={label} data-testid={testId}>
      <Icon name={icon} />
    </button>
  );
}

/** The small "?" next to a number: opens "How was this calculated?". */
export function HowButton({ onClick, testId }: { onClick: () => void; testId?: string }) {
  return (
    <button type="button" class="how-btn" onClick={onClick} title={t('how.open')} aria-label={t('how.open')} data-testid={testId}>
      ?
    </button>
  );
}

// --- Choices -------------------------------------------------------------------

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
  testId?: string;
  /** Lets the options run onto a second line when they do not fit. */
  wrap?: boolean;
}

export function Segmented<T extends string>({ value, options, onChange, label, testId, wrap }: SegmentedProps<T>) {
  return (
    <div class={wrap ? 'segmented is-wrapping' : 'segmented'} role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          class={option.value === value ? 'is-selected' : ''}
          onClick={() => onChange(option.value)}
          data-testid={testId ? `${testId}-${option.value}` : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, testId }: { checked: boolean; onChange: (checked: boolean) => void; label: string; testId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} class={`switch${checked ? ' is-on' : ''}`} onClick={() => onChange(!checked)} data-testid={testId}>
      <span class="switch-knob" />
    </button>
  );
}

/** A labelled row: label on the left (or above on narrow screens), control on the right. */
export function Field({
  label,
  hint,
  stacked,
  children,
}: {
  label: string;
  hint?: string;
  /** Label above and the control across the whole width, for wide controls. */
  stacked?: boolean;
  children: ComponentChildren;
}) {
  return (
    <div class={stacked ? 'field field-stacked' : 'field'}>
      <div class="field-label">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </div>
      <div class="field-control">{children}</div>
    </div>
  );
}

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  label: string;
  suffix?: string;
  testId?: string;
  width?: number;
}

/** A number box that only reports valid numbers inside its limits. */
export function NumberInput({ value, onChange, min, max, step = 'any', label, suffix, testId, width = 92 }: NumberInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  // Show the outside value unless the user is typing in the box.
  useEffect(() => {
    const input = ref.current;
    if (input && document.activeElement !== input) input.value = String(value);
  }, [value]);
  const commit = (event: Event): void => {
    const parsed = Number((event.currentTarget as HTMLInputElement).value.replace(',', '.'));
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    onChange(clamped);
  };
  return (
    <span class="number-input">
      <input
        ref={ref}
        type="number"
        inputMode="decimal"
        defaultValue={String(value)}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        style={{ width: `${width}px` }}
        onInput={commit}
        onBlur={(event) => {
          event.currentTarget.value = String(value);
        }}
        data-testid={testId}
      />
      {suffix ? <span class="number-suffix">{suffix}</span> : null}
    </span>
  );
}

// --- Dialog --------------------------------------------------------------------

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ComponentChildren;
  wide?: boolean;
  testId?: string;
  footer?: ComponentChildren;
}

export function Dialog({ title, onClose, children, wide, testId, footer }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div class="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()} data-testid={testId ? `${testId}-backdrop` : undefined}>
      <div class={`dialog${wide ? ' dialog-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} data-testid={testId}>
        <header class="dialog-header">
          <h2>{title}</h2>
          <IconButton icon="close" label={t('common.close')} onClick={onClose} testId={testId ? `${testId}-close` : undefined} />
        </header>
        <div class="dialog-body">{children}</div>
        {footer ? <footer class="dialog-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
