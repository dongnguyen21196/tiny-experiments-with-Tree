let override: (() => Date) | null = null;
export const now = (): Date => (override ? override() : new Date());
/** Chỉ dùng trong test. */
export function setClock(fn: (() => Date) | null) {
  override = fn;
}
