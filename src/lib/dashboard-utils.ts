import type { TriageSession } from '@/types/api';

/* ─── Patient display ID / name ───────────────────────────── */
export function patientDisplayId(session: TriageSession): string {
  if (session.patient_name) return session.patient_name;
  const year = new Date(session.created_at).getFullYear();
  return `P-${year}-${session.id.slice(-4).toUpperCase()}`;
}

export function patientDemographicsLabel(session: TriageSession): string {
  const parts: string[] = [];
  if (session.patient_age) parts.push(`${session.patient_age}y`);
  if (session.patient_sex) parts.push(session.patient_sex.charAt(0).toUpperCase() + session.patient_sex.slice(1));
  return parts.join(' · ');
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
    return { text: 'Red Flag', icon: '🔴', color: 'text-danger' };
  }
  if (session.status === 'COMPLETED') {
    return { text: 'Routed', icon: '✅', color: 'text-success' };
  }
  if (session.ctas_level) {
    return { text: 'In Assessment', icon: '📊', color: 'text-sc-500' };
  }
  return { text: 'Waiting', icon: '⏳', color: 'text-sc-500' };
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
  1: 'border-ctas-1',
  2: 'border-ctas-2',
  3: 'border-ctas-3',
  4: 'border-ctas-4',
  5: 'border-ctas-5',
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
  if (systolic < 180) return { label: 'Stage 2 Hypertension', tone: 'orange' };
  return { label: 'Hypertensive Crisis', tone: 'red' };
}

/* ─── Heart Rate classification ───────────────────────────── */
export function classifyHr(bpm?: number): {
  label: string;
  tone: 'green' | 'amber' | 'orange' | 'red' | 'muted';
} {
  if (bpm == null) return { label: '—', tone: 'muted' };
  if (bpm < 50) return { label: 'Low', tone: 'orange' };
  if (bpm > 110) return { label: 'Tachycardia', tone: 'red' };
  if (bpm >= 90) return { label: 'Elevated', tone: 'orange' };
  return { label: 'Normal', tone: 'green' };
}

/* ─── SPO2 classification ─────────────────────────────────── */
export function classifySpo2(spo2?: number): {
  label: string;
  tone: 'green' | 'amber' | 'orange' | 'red' | 'muted';
} {
  if (spo2 == null) return { label: '—', tone: 'muted' };
  if (spo2 < 90) return { label: 'Critical', tone: 'red' };
  if (spo2 < 95) return { label: 'Low', tone: 'amber' };
  return { label: 'Normal', tone: 'green' };
}

/* ─── Temperature classification (Celsius) ────────────────── */
export function classifyTemp(c?: number): {
  label: string;
  tone: 'green' | 'amber' | 'orange' | 'red' | 'muted';
} {
  if (c == null) return { label: '—', tone: 'muted' };
  if (c < 35.0) return { label: 'Hypothermia', tone: 'amber' };
  if (c < 37.5) return { label: 'Normal', tone: 'green' };
  if (c < 38.0) return { label: 'Low-grade Fever', tone: 'amber' };
  if (c < 39.0) return { label: 'Fever', tone: 'orange' };
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
