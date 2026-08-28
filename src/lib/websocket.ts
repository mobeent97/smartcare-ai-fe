'use client';

import type { TriageSession, DeteriorationAlert } from '@/types/api';
import type { HelpRequest } from '@/components/dashboard/HelpRequestModal';

// Auto-upgrade ws:// → wss:// when the page is served over HTTPS.
// Set NEXT_PUBLIC_WS_URL in your deployment env to point at your backend host.
function resolveWsBase(): string {
  const configured = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8000';
  if (typeof window === 'undefined') return configured;
  if (window.location.protocol === 'https:' && configured.startsWith('ws://')) {
    return configured.replace('ws://', 'wss://');
  }
  return configured;
}

const WS_BASE = resolveWsBase();

export class DashboardWebSocket {
  private socket: WebSocket | null = null;
  private token: string;
  private reconnectDelay = 2000;
  private maxReconnects = 5;
  private reconnectCount = 0;
  private onQueueUpdate: (sessionId: string, data: Partial<TriageSession>) => void;
  private onEmergencyAlert: (alert: { sessionId: string; reason: string; redFlags: string[] }) => void;
  private onDeteriorationAlert: (alert: DeteriorationAlert) => void;
  private onHelpRequest: (alert: HelpRequest) => void;

  constructor(
    token: string,
    onQueueUpdate: (sessionId: string, data: Partial<TriageSession>) => void,
    onEmergencyAlert: (alert: { sessionId: string; reason: string; redFlags: string[] }) => void,
    onDeteriorationAlert: (alert: DeteriorationAlert) => void = () => {},
    onHelpRequest: (alert: HelpRequest) => void = () => {},
  ) {
    this.token = token;
    this.onQueueUpdate = onQueueUpdate;
    this.onEmergencyAlert = onEmergencyAlert;
    this.onDeteriorationAlert = onDeteriorationAlert;
    this.onHelpRequest = onHelpRequest;
  }

  connect(): void {
    const url = `${WS_BASE}/ws/dashboard/?token=${this.token}`;
    this.socket = new WebSocket(url);

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'queue_update') {
          this.onQueueUpdate(msg.data.session_id, {
            ctas_level: msg.data.ctas_level,
            status: msg.data.status,
          });
        } else if (msg.type === 'emergency_alert') {
          this.onEmergencyAlert({
            sessionId: msg.data.session_id,
            reason: msg.data.reason,
            redFlags: msg.data.red_flags ?? [],
          });
        } else if (msg.type === 'help_request') {
          this.onHelpRequest({
            sessionId: msg.data.session_id,
            patientName: msg.data.patient_name ?? null,
            reason: msg.data.reason ?? 'patient_request',
          });
        } else if (msg.type === 'deterioration_alert') {
          this.onDeteriorationAlert({
            sessionId: msg.data.session_id,
            patientName: msg.data.patient_name ?? null,
            oldCtas: msg.data.old_ctas,
            newCtas: msg.data.new_ctas,
            waitMinutes: msg.data.wait_minutes,
            reason: msg.data.reason,
          });
        }
      } catch {
        // malformed message — ignore
      }
    };

    this.socket.onclose = (event) => {
      if (event.code !== 4001 && this.reconnectCount < this.maxReconnects) {
        this.reconnectCount++;
        setTimeout(() => this.connect(), this.reconnectDelay);
      }
    };

    this.socket.onerror = () => {
      // onclose will fire after onerror — reconnect logic handles it
    };
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.reconnectCount = 0;
  }
}

export class BoothWebSocket {
  private socket: WebSocket | null = null;
  private sessionId: string;
  private onDeviceComplete: (data: Record<string, unknown>) => void;
  private onDeviceStatus: (status: string) => void;

  constructor(
    sessionId: string,
    onDeviceComplete: (data: Record<string, unknown>) => void,
    onDeviceStatus: (status: string) => void = () => {}
  ) {
    this.sessionId = sessionId;
    this.onDeviceComplete = onDeviceComplete;
    this.onDeviceStatus = onDeviceStatus;
  }

  connect(): void {
    const url = `${WS_BASE}/ws/booth/${this.sessionId}/`;
    this.socket = new WebSocket(url);

    this.socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        if (msg.type === 'device_reading_complete') {
          this.onDeviceComplete(msg.data);
        } else if (msg.type === 'device_status') {
          this.onDeviceStatus(msg.data?.status ?? '');
        }
      } catch {
        // malformed message — ignore
      }
    };
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
  }
}
