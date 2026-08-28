// Booth/stream lifecycle logger. Mirrors every event to the browser console
// AND ships it to the backend (/triage/avatar/log/) so it lands in
// logs/avatar_stream_fe.log next to the BE log — diff the two timelines to see
// who did what and when. Never throws.
//
// Events are BATCHED. The previous version fired one fetch(keepalive) per
// event; browsers cap in-flight keepalive requests, so a burst of realtime
// events silently dropped most of them — which is why latency_report showed
// zero turns for sessions that plainly had them. Now events queue and go out
// as one POST every FLUSH_MS (or sooner when the queue is full), and the
// remainder is handed to sendBeacon on page hide so nothing is lost on exit.
// The backend's ingest endpoint already accepts { events: [...] }.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';
const ENDPOINT = `${BASE_URL}/triage/avatar/log/`;

const FLUSH_MS = 1500;
const MAX_QUEUE = 20;

type LogEvent = Record<string, unknown> & { session_id: string | null; event: string; ts: string };

let queue: LogEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listenersInstalled = false;

function drain(): LogEvent[] {
  const out = queue;
  queue = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  return out;
}

function flush(): void {
  const events = drain();
  if (events.length === 0) return;
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* logging must never break the caller */
  }
}

/** On page hide the fetch may not complete; sendBeacon is built for this. */
function flushOnHide(): void {
  const events = drain();
  if (events.length === 0) return;
  try {
    const body = new Blob([JSON.stringify({ events })], { type: 'application/json' });
    if (!navigator.sendBeacon?.(ENDPOINT, body)) {
      // Beacon refused (payload too large, etc.) — fall back to keepalive fetch.
      fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* ignore */
  }
}

function installListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return;
  listenersInstalled = true;
  window.addEventListener('pagehide', flushOnHide);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushOnHide();
  });
}

export function streamLog(
  sessionId: string | null | undefined,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const ts = new Date().toISOString();
  // Console: one compact line.
  // eslint-disable-next-line no-console
  console.log(`[STREAM ${ts}] ${event}`, { session_id: sessionId, ...fields });

  try {
    installListeners();
    queue.push({ session_id: sessionId ?? null, event, ts, ...fields });
    if (queue.length >= MAX_QUEUE) {
      flush();
    } else if (!timer) {
      timer = setTimeout(flush, FLUSH_MS);
    }
  } catch {
    /* logging must never break the caller */
  }
}
