// Avatar/stream lifecycle logger. Mirrors every event to the browser console
// AND ships it to the backend (/triage/avatar/log/) so it lands in
// logs/avatar_stream_fe.log next to the BE log — diff the two timelines to see
// who tore the stream down and why. Fire-and-forget with keepalive so events
// survive page unload/navigation. Never throws.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

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
    const body = JSON.stringify({ session_id: sessionId ?? null, event, ts, ...fields });
    fetch(`${BASE_URL}/triage/avatar/log/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true, // survive unload (page-hide / navigation teardown)
    }).catch(() => {});
  } catch {
    /* logging must never break the caller */
  }
}
