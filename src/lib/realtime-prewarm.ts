// Cold-start prewarming for the realtime booth.
//
// connect() runs strictly in series: mint the ephemeral key, then ask for the
// microphone, then exchange SDP. The first two have no dependency on each other
// and neither depends on the realtime page existing — so both can happen while
// the patient is still on the consent screen, leaving only the SDP exchange
// between page load and the first word.
//
// Consent ordering matters here and is deliberate:
//   - the microphone permission prompt is requested on consent MOUNT. It sends
//     nothing anywhere; it only gets the browser dialog out of the way early,
//     while the patient is reading rather than while the nurse is greeting them.
//   - the ephemeral key is minted only AFTER consent is recorded, because
//     minting builds system instructions from the session. Never before.

import { api } from './api';
import {
  CallbackRelay,
  RealtimeClient,
  ToolRelay,
  detectDeviceProfile,
  type RealtimeSessionMint,
} from './openai-realtime';

interface CachedMint {
  sessionId: string;
  promise: Promise<RealtimeSessionMint>;
  /** Resolved value, once available — used for the freshness check. */
  value: RealtimeSessionMint | null;
}

let cached: CachedMint | null = null;

/** Keys are short-lived; treat anything with under this much life as unusable. */
const MIN_REMAINING_SECONDS = 25;

function isFresh(mint: RealtimeSessionMint): boolean {
  if (!mint.expires_at) return false;
  return mint.expires_at - Math.floor(Date.now() / 1000) > MIN_REMAINING_SECONDS;
}

/**
 * Ask for microphone permission early. Tracks are stopped immediately — the
 * grant persists for the origin, so the real getUserMedia in connect() resolves
 * without a prompt. Safe to call more than once; never throws.
 */
export async function prewarmMic(): Promise<void> {
  try {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Release the device right away. We wanted the permission, not the capture —
    // holding it open would light the browser's recording indicator on a page
    // where nothing is being recorded.
    stream.getTracks().forEach((t) => t.stop());
  } catch {
    // Denied or unavailable. connect() will surface it properly in context.
  }
}

/**
 * Start minting the ephemeral key now so the realtime page can pick up the
 * result instead of starting the round trip itself. Fire-and-forget: callers
 * navigate immediately and do not await this.
 */
export function prefetchMint(sessionId: string): void {
  if (cached?.sessionId === sessionId) return; // already in flight or held
  const entry: CachedMint = {
    sessionId,
    value: null,
    promise: api
      .createRealtimeSession(sessionId, detectDeviceProfile())
      .then((mint) => {
        entry.value = mint;
        return mint;
      })
      .catch((e) => {
        // Drop the entry so the realtime page mints normally rather than
        // inheriting a rejected promise.
        if (cached === entry) cached = null;
        throw e;
      }),
  };
  cached = entry;
}

/**
 * Hand over a prefetched mint if one is usable, else null.
 *
 * Returns null rather than throwing on any doubt — a stale, failed or
 * wrong-session prefetch must degrade to the normal mint path, never break the
 * booth. Consumed once: the entry is cleared so a reconnect mints fresh.
 */
export async function takePrefetchedMint(
  sessionId: string,
): Promise<RealtimeSessionMint | null> {
  const entry = cached;
  if (!entry || entry.sessionId !== sessionId) return null;
  cached = null;
  try {
    const mint = await entry.promise;
    return isFresh(mint) ? mint : null;
  } catch {
    return null;
  }
}

// ─── Pre-CONNECT (not just pre-mint) ─────────────────────────────────────────
// The mint is ~7ms once prefetched; the remaining cold start is the WebRTC
// handshake itself — SDP exchange 1.1–1.3s plus data-channel open 0.9–1.6s,
// measured. Both can run while the patient is still walking from the consent
// screen to the booth screen. The client is built against relays that buffer
// every event until the booth page attaches its real callbacks, so nothing is
// lost and — critically — the greeting is NOT requested until the page is
// actually on screen (the page calls startConversation() from onConnected,
// which the relay replays on attach).

export interface PrewarmedClient {
  client: RealtimeClient;
  mint: RealtimeSessionMint;
}

interface CachedClient extends PrewarmedClient {
  sessionId: string;
  expires: ReturnType<typeof setTimeout>;
}

let cachedClient: CachedClient | null = null;

/** A prewarmed client nobody claims is a live mic and a billable session with
 *  no page. Tear it down if the booth page has not arrived in this long. */
const PREWARM_TTL_MS = 45_000;

function dropCachedClient(): void {
  if (!cachedClient) return;
  clearTimeout(cachedClient.expires);
  cachedClient.client.destroy();
  cachedClient = null;
}

/**
 * Mint AND connect ahead of the booth page. Call on "I agree" — after consent
 * is recorded, never before. Fire-and-forget; failures fall back to the
 * page's normal connect path.
 */
export function prewarmConnection(sessionId: string): void {
  if (cachedClient?.sessionId === sessionId) return;
  dropCachedClient();
  prefetchMint(sessionId);
  void (async () => {
    let mint: RealtimeSessionMint | null = null;
    try {
      mint = await takePrefetchedMint(sessionId);
    } catch {
      mint = null;
    }
    if (!mint) return;
    const client = new RealtimeClient(mint, new CallbackRelay(), new ToolRelay());
    const entry: CachedClient = {
      sessionId,
      mint,
      client,
      expires: setTimeout(() => {
        if (cachedClient === entry) dropCachedClient();
      }, PREWARM_TTL_MS),
    };
    cachedClient = entry;
    try {
      await client.connect();
    } catch {
      // Mic refused, SDP failed, whatever — the page will try itself and
      // surface the real error with proper UI.
      if (cachedClient === entry) dropCachedClient();
    }
  })();
}

/**
 * Hand over a prewarmed client for this session, or null. Consumed once. The
 * caller must attach() its callbacks/tools immediately; buffered events
 * (including onConnected) replay at that moment.
 */
export function takePrefetchedClient(sessionId: string): PrewarmedClient | null {
  const entry = cachedClient;
  if (!entry || entry.sessionId !== sessionId) return null;
  clearTimeout(entry.expires);
  cachedClient = null;
  return { client: entry.client, mint: entry.mint };
}
