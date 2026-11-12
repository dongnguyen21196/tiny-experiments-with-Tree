/** Báo cho các tab khác biết dữ liệu đã thay đổi (BR-22). */
type Listener = () => void;
const listeners = new Set<Listener>();
let channel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel('tiny-experiments');
    channel.onmessage = () => listeners.forEach((l) => l());
  }
} catch {
  channel = null;
}

export function notifyChange() {
  listeners.forEach((l) => l());
  try {
    channel?.postMessage('changed');
  } catch {
    /* ignore */
  }
}

export function onChange(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
