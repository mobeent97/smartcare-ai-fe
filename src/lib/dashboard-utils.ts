import type { TriageSession } from '@/types/api';

/* ─── Patient display ID ──────────────────────────────────── */
export function patientDisplayId(session: TriageSession): string {
  const year = new Date(session.created_at).getFullYear();
  return `P-${year}-${session.id.slice(-4).toUpperCase()}`;
}

/* ─── Priority score (0–99) ───────────────────────────────── */
export function priorityScore(session: TriageSession): number {
  const base = session.ctas_level ? (6 - session.ctas_level) * 18 : 40;
  const flagBoost = (session.red_flags ?? []).length * 4;
  return Math.min(99, base + flagBoost);
}

/* ─── Relative time label ─────────────────────────────────── */
export function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m ago`;
}

/* ─── Status pill data ────────────────────────────────────── */
export function statusPill(session: TriageSession): {
  text: string;
  icon: string;
  color: string;
} {
  const flags = session.red_flags ?? [];
  if (flags.length > 0) {
    return { text: 'Red Flag', icon: '●', color: 'text-ctas-1' };
  }
  if (session.status === 'COMPLETED') {
    return { text: 'Routed', icon: '✓', color: 'text-success' };
  }
  if (session.ctas_level) {
    return { text: 'In Assessment', icon: '▪', color: 'text-warning' };
  }
  return { text: 'Waiting', icon: '◷', color: 'text-text-muted' };
}

/* ─── First complaint from answers ────────────────────────── */
export function firstComplaint(session: TriageSession): string {
  const answers = session.answers ?? [];
  const complaint = answers.find((a) => a.step_name === 'complaint');
  if (complaint) return complaint.raw_input;
  const flags = session.red_flags ?? [];
  if (flags.length) return flags[0];
  return 'Pending intake';
}

/* ─── CTAS accent color class ─────────────────────────────── */
export const CTAS_ACCENT_CLASS: Record<number, string> = {
  1: 'border-l-ctas-1',
  2: 'border-l-ctas-2',
  3: 'border-l-ctas-3',
  4: 'border-l-ctas-4',
  5: 'border-l-ctas-5',
};

/* ─── Step labels for answers tab ─────────────────────────── */
export const STEP_LABELS: Record<string, string> = {
  first_look: 'Emergency Screening',
  complaint: 'Chief Complaint',
  symptom_detail: 'Pain & Severity',
  vitals: 'Vital Signs',
};

/* ─── BP classification ───────────────────────────────────── */
export function classifyBp(systolic?: number): {
  label: string;
  tone: 'green' | 'amber' | 'orange' | 'red' | 'muted';
} {
  if (systolic == null) return { label: '—', tone: 'muted' };
  if (systolic < 120) return { label: 'Normal', tone: 'green' };
  if (systolic < 130) return { label: 'Elevated', tone: 'amber' };
  if (systolic < 140) return { label: 'Stage 1 HTN', tone: 'orange' };
  if (systolic < 180) return { label: 'Stage 2 HTN', tone: 'red' };
  return { label: 'Hypertensive Crisis', tone: 'red' };
}

/* ─── Temperature classification ──────────────────────────── */
export function classifyTemp(f?: number): {
  label: string;
  tone: 'green' | 'amber' | 'orange' | 'red' | 'muted';
} {
  if (f == null) return { label: '—', tone: 'muted' };
  if (f < 97) return { label: 'Hypothermia', tone: 'amber' };
  if (f < 99.5) return { label: 'Normal', tone: 'green' };
  if (f < 100.9) return { label: 'Low-grade Fever', tone: 'amber' };
  if (f < 103) return { label: 'Fever', tone: 'orange' };
  return { label: 'High Fever', tone: 'red' };
}

/* ─── Reasoning splitter ──────────────────────────────────── */
export function splitReasoning(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/* ─── Audit event colors ──────────────────────────────────── */
export const AUDIT_COLORS: Record<string, string> = {
  SESSION_START: '#3b82f6',
  DEVICE_READ: '#22c55e',
  CTAS_SCORED: '#eab308',
  ALARM_TRIGGERED: '#dc2626',
  AVATAR_SESSION_CREATED: '#36c9c5',
  AVATAR_SESSION_CLOSED: '#207976',
};

/* ─── Timeline dot colors ─────────────────────────────────── */
export const TIMELINE_DOT_COLORS: Record<string, string> = {
  SESSION_START: '#3b82f6',
  CONSENT_GIVEN: '#22c55e',
  DEVICE_READ: '#22c55e',
  CTAS_SCORED: '#eab308',
  ALARM_TRIGGERED: '#dc2626',
  AVATAR_SESSION_CREATED: '#36c9c5',
  AVATAR_SESSION_CLOSED: '#207976',
  FIRST_LOOK: '#22c55e',
  COMPLAINT: '#ea580c',
  SEVERITY: '#eab308',
  RED_FLAG: '#dc2626',
};
