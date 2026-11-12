import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { WEEKDAY_LONG, WEEKDAY_SHORT } from '../domain/dates';
import { ConflictError, DomainError } from '../domain/rules';

export function errorMessage(e: unknown): string {
  if (e instanceof DomainError || e instanceof ConflictError) return e.message;
  const name = (e as Error)?.name;
  if (name === 'QuotaExceededError' || (e as { inner?: { name?: string } })?.inner?.name === 'QuotaExceededError')
    return 'Bộ nhớ trình duyệt đã đầy nên chưa lưu được. Nội dung vẫn còn trên form — hãy sao chép lại hoặc giải phóng bộ nhớ rồi thử lại.';
  if (name === 'ConstraintError') return 'Dữ liệu trùng với bản đã có (có thể vừa lưu ở tab khác). Hãy tải lại trang.';
  if (name === 'ImportError') return (e as Error).message;
  return 'Chưa lưu được do lỗi bộ nhớ trình duyệt. Nội dung vẫn còn trên form — hãy thử lại hoặc sao chép để giữ.';
}

export function ErrorBox({ error, copyText, onRetry }: { error: string | null; copyText?: string; onRetry?: () => void }) {
  const [copied, setCopied] = useState(false);
  if (!error) return null;
  return (
    <div className="alert alert-error" role="alert">
      <p>{error}</p>
      <div className="row">
        {onRetry && (
          <button type="button" className="btn btn-small" onClick={onRetry}>
            Thử lại
          </button>
        )}
        {copyText && (
          <button
            type="button"
            className="btn btn-small btn-ghost"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(copyText);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'Đã sao chép' : 'Sao chép nội dung'}
          </button>
        )}
      </div>
    </div>
  );
}

export function SavedNote({ show, text = 'Đã lưu' }: { show: boolean; text?: string }) {
  return (
    <span className="saved-note" role="status" aria-live="polite">
      {show ? `✓ ${text}` : ''}
    </span>
  );
}

export function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  multiline?: boolean;
  rows?: number;
  hint?: ReactNode;
  error?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const over = props.value.trim().length > props.max;
  const err = props.error ?? (over ? `Tối đa ${props.max} ký tự.` : undefined);
  const describedBy = [props.hint ? `${id}-hint` : '', err ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    value: props.value,
    placeholder: props.placeholder,
    autoFocus: props.autoFocus,
    'aria-invalid': !!err,
    'aria-describedby': describedBy,
    onChange: (ev: { target: { value: string } }) => props.onChange(ev.target.value),
  };
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      {props.hint && (
        <p className="hint" id={`${id}-hint`}>
          {props.hint}
        </p>
      )}
      {props.multiline ? <textarea rows={props.rows ?? 3} {...common} /> : <input type="text" {...common} />}
      <div className="field-foot">
        {err ? (
          <span className="field-error" id={`${id}-err`}>
            {err}
          </span>
        ) : (
          <span />
        )}
        <span className={`counter ${over ? 'over' : ''}`}>
          {props.value.trim().length}/{props.max}
        </span>
      </div>
    </div>
  );
}

export function DateField(props: { label: string; value: string | null; onChange: (v: string) => void; min?: string; error?: string; hint?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{props.label}</label>
      {props.hint && <p className="hint">{props.hint}</p>}
      <input
        id={id}
        type="date"
        value={props.value ?? ''}
        min={props.min}
        aria-invalid={!!props.error}
        aria-describedby={props.error ? `${id}-err` : undefined}
        onChange={(e) => props.onChange(e.target.value)}
      />
      {props.error && (
        <span className="field-error" id={`${id}-err`}>
          {props.error}
        </span>
      )}
    </div>
  );
}

export function WeekdayPicker({ value, onChange, error }: { value: number[]; onChange: (v: number[]) => void; error?: string }) {
  const id = useId();
  const toggle = (d: number) => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort());
  return (
    <fieldset className="field" aria-describedby={error ? `${id}-err` : undefined}>
      <legend>Những ngày trong tuần bạn sẽ thử</legend>
      <div className="weekdays">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <label key={d} className={`chip ${value.includes(d) ? 'chip-on' : ''}`}>
            <input type="checkbox" checked={value.includes(d)} onChange={() => toggle(d)} aria-label={WEEKDAY_LONG[d]} />
            {WEEKDAY_SHORT[d]}
          </label>
        ))}
      </div>
      <div className="row quick">
        <button type="button" className="link-btn" onClick={() => onChange([1, 2, 3, 4, 5, 6, 7])}>
          Mỗi ngày
        </button>
        <button type="button" className="link-btn" onClick={() => onChange([1, 2, 3, 4, 5])}>
          Ngày làm việc
        </button>
        <button type="button" className="link-btn" onClick={() => onChange([6, 7])}>
          Cuối tuần
        </button>
      </div>
      {error && (
        <span className="field-error" id={`${id}-err`}>
          {error}
        </span>
      )}
    </fieldset>
  );
}

/** Hộp thoại dùng <dialog> gốc: quản lý focus và phím Esc. */
export function Modal({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      {open && (
        <div className="modal-body">
          <h2 id={titleId}>{title}</h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Confirm(props: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={props.open} title={props.title} onClose={props.onClose}>
      {props.children}
      <div className="row end">
        <button type="button" className="btn btn-ghost" onClick={props.onClose}>
          Hủy
        </button>
        <button type="button" className={`btn ${props.danger ? 'btn-danger' : ''}`} disabled={props.busy} onClick={props.onConfirm}>
          {props.confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  /** Chống double submit (BR-21). */
  const run = async (fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await fn();
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}

export function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function stampForFile() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}
