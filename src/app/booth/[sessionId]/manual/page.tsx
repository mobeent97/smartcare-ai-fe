'use client';

import { useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useBoothStore } from '@/store/booth';
import type { DeviceMeasurement } from '@/types/api';

/* ─── Types ──────────────────────────────────────────────────── */
type Step = 'consent' | 'demographics' | 'emergency' | 'complaint' | 'pain' | 'vitals';
const STEPS: Step[] = ['consent', 'demographics', 'emergency', 'complaint', 'pain', 'vitals'];
const STEP_LABELS = ['Consent', 'About You', 'Safety Check', 'Your Complaint', 'Pain Level', 'Vital Signs'];

/* ─── Constants ──────────────────────────────────────────────── */
const COMPLAINT_CHIPS = [
  'Chest Pain', 'Headache', 'Fever', 'Nausea/Vomiting',
  'Difficulty Breathing', 'Abdominal Pain', 'Dizziness', 'Injury/Trauma',
  'Back Pain', 'Skin Rash', 'Ear/Nose/Throat', 'Mental Health',
];

const PAIN_COLORS = [
  '#22c55e', '#4ade80', '#a3e635', '#facc15',
  '#fb923c', '#f97316', '#ef4444', '#dc2626', '#b91c1c', '#991b1b',
];

const PAIN_LABELS: Record<number, string> = {
  1: 'None / Minimal', 2: 'Very Mild', 3: 'Mild',
  4: 'Mild-Moderate', 5: 'Moderate', 6: 'Moderate-Severe',
  7: 'Severe', 8: 'Very Severe', 9: 'Extreme', 10: 'Worst Possible',
};

/* ─── Icons ──────────────────────────────────────────────────── */
const EcgLine = () => (
  <svg width="28" height="16" viewBox="0 0 32 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M0 9 H7 L9 2 L12 16 L15 5 L17 13 L19 9 H32" />
  </svg>
);
const ArrowLeft = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
  </svg>
);
const CheckCircle = () => (
  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
);
const HeartIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>
);
const ThermometerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
  </svg>
);
const DropletIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
  </svg>
);
const SpinnerIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'btn-spin 1s linear infinite' }}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
  </svg>
);

/* ─── Reusable UI ────────────────────────────────────────────── */
function PrimaryBtn({ onClick, disabled, loading, children }: {
  onClick: () => void; disabled?: boolean; loading?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all active:scale-95 disabled:opacity-40"
      style={{
        minHeight: 60,
        background: disabled || loading ? 'rgba(9,246,238,0.3)' : 'linear-gradient(135deg, #07c5bf, #09f6ee)',
        color: '#012221',
        border: 'none',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        fontFamily: 'monospace',
        letterSpacing: '-0.01em',
        fontSize: 16,
      }}
    >
      {loading ? <><SpinnerIcon /> Processing…</> : children}
    </button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'var(--color-dash-card)', border: '1px solid rgba(21,81,80,0.6)' }}>
      {children}
    </div>
  );
}

/* ─── Vitals Row ─────────────────────────────────────────────── */
interface VitalRowProps {
  icon: React.ReactNode;
  label: string;
  unit: string;
  value?: string;
  loading?: boolean;
  error?: boolean;
  accentColor: string;
  onMeasure: () => void;
  onSkip: () => void;
  done: boolean;
}
function VitalRow({ icon, label, unit, value, loading, error, accentColor, onMeasure, onSkip, done }: VitalRowProps) {
  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--color-dash-surface)', borderColor: done ? `${accentColor}40` : 'rgba(21,81,80,0.5)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span style={{ color: accentColor }}>{icon}</span>
          <span className="font-semibold text-sm" style={{ color: 'var(--color-text-primary)' }}>{label}</span>
        </div>
        {done && !loading && (
          <span className="text-xs px-2 py-0.5 rounded-full font-mono" style={{ background: `${accentColor}15`, color: accentColor, border: `1px solid ${accentColor}30` }}>
            ✓ Done
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-1">
          <SpinnerIcon />
          <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Measuring…</span>
        </div>
      ) : value ? (
        <div className="font-black text-2xl font-mono" style={{ color: accentColor, fontFamily: 'monospace' }}>
          {value} <span className="text-sm font-normal" style={{ color: 'var(--color-text-muted)' }}>{unit}</span>
        </div>
      ) : error ? (
        <p className="text-xs" style={{ color: 'rgba(252,165,165,0.8)' }}>Measurement failed.</p>
      ) : (
        <div className="flex gap-2">
          <button
            onClick={onMeasure}
            className="flex-1 rounded-xl py-2 text-sm font-semibold transition-all"
            style={{ background: `${accentColor}12`, color: accentColor, border: `1px solid ${accentColor}35` }}
          >
            Take Reading
          </button>
          <button
            onClick={onSkip}
            className="px-4 rounded-xl py-2 text-sm transition-all"
            style={{ color: 'var(--color-text-muted)', border: '1px solid rgba(21,81,80,0.5)', background: 'transparent' }}
          >
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────── */
export default function ManualTriagePage() {
  const router = useRouter();
  const { sessionId } = useParams<{ sessionId: string }>();
  const { setMeasurementResult } = useBoothStore();

  const [step, setStep] = useState<Step>('consent');
  const [loading, setLoading] = useState(false);

  // Demographics
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientSex, setPatientSex] = useState('');

  // Form data
  const [complaint, setComplaint] = useState('');
  const [painLevel, setPainLevel] = useState<number | null>(null);

  // Vitals state
  const [bpValue, setBpValue] = useState('');
  const [bpLoading, setBpLoading] = useState(false);
  const [bpError, setBpError] = useState(false);
  const [bpDone, setBpDone] = useState(false);

  const [tempValue, setTempValue] = useState('');
  const [tempLoading, setTempLoading] = useState(false);
  const [tempError, setTempError] = useState(false);
  const [tempDone, setTempDone] = useState(false);

  const [spo2Value, setSpo2Value] = useState('');
  const [spo2Loading, setSpo2Loading] = useState(false);
  const [spo2Error, setSpo2Error] = useState(false);
  const [spo2Done, setSpo2Done] = useState(false);

  const stepIndex = STEPS.indexOf(step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  /* ── Handlers ── */

  function addChip(chip: string) {
    setComplaint((prev) => prev ? `${prev}, ${chip.toLowerCase()}` : chip.toLowerCase());
  }

  async function handleDemographics() {
    if (!patientName.trim() || !patientAge) return;
    setLoading(true);
    try {
      await api.updatePatientInfo(sessionId, {
        name: patientName.trim(),
        age: Number(patientAge),
        sex: patientSex,
      });
      // Also record as a triage answer so it appears in the dashboard answers tab
      await api.submitAnswer(
        sessionId,
        'demographics',
        `${patientName.trim()}, ${patientAge} years old, ${patientSex || 'not specified'}`
      );
    } catch { /* continue regardless */ }
    setLoading(false);
    setStep('emergency');
  }

  async function handleEmergency(answer: 'yes' | 'no') {
    setLoading(true);
    try {
      // Always notify backend first so the dashboard receives the WebSocket alert.
      // For 'yes' this triggers CTAS-1 escalation; for 'no' it clears the first-look step.
      await api.submitAnswer(sessionId, 'first_look', answer);
    } catch { /* navigate regardless — patient safety over API errors */ }
    setLoading(false);

    if (answer === 'yes') {
      router.push(`/booth/${sessionId}/emergency`);
    } else {
      setStep('complaint');
    }
  }

  async function handleComplaint() {
    if (!complaint.trim()) return;
    setLoading(true);
    try {
      await api.submitAnswer(sessionId, 'complaint', complaint.trim());
    } catch { /* continue */ }
    setLoading(false);
    setStep('pain');
  }

  async function handlePain() {
    if (painLevel === null) return;
    setLoading(true);
    try {
      await api.submitAnswer(sessionId, 'symptom_detail', String(painLevel));
    } catch { /* continue */ }
    setLoading(false);
    setStep('vitals');
  }

  async function measureBP() {
    setBpLoading(true); setBpError(false);
    try {
      const res = await api.triggerMeasurement(sessionId, 'BLOOD_PRESSURE');
      // Backend returns readings flat in data: { systolic, diastolic, heart_rate }
      const r = (res.data ?? {}) as unknown as Record<string, number | string>;
      setBpValue(`${r.systolic ?? '—'}/${r.diastolic ?? '—'}`);
      setMeasurementResult(res.data as DeviceMeasurement);
      setBpDone(true);
    } catch { setBpError(true); }
    setBpLoading(false);
  }

  async function measureTemp() {
    setTempLoading(true); setTempError(false);
    try {
      const res = await api.triggerMeasurement(sessionId, 'TEMPERATURE');
      const r = (res.data ?? {}) as unknown as Record<string, number | string>;
      setTempValue(`${r.temperature ?? '—'}°C`);
      setTempDone(true);
    } catch { setTempError(true); }
    setTempLoading(false);
  }

  async function measureSpo2() {
    setSpo2Loading(true); setSpo2Error(false);
    try {
      const res = await api.triggerMeasurement(sessionId, 'OXIMETER');
      const r = (res.data ?? {}) as unknown as Record<string, number | string>;
      setSpo2Value(`${r.spo2 ?? '—'}%`);
      setSpo2Done(true);
    } catch { setSpo2Error(true); }
    setSpo2Loading(false);
  }

  function handleFinish() {
    router.push(`/booth/${sessionId}/results`);
  }

  function goBack() {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  }

  /* ── Step Content ── */

  function renderDemographics() {
    const SEX_OPTIONS = [
      { value: 'male', label: 'Male' },
      { value: 'female', label: 'Female' },
      { value: 'other', label: 'Other' },
      { value: '', label: 'Prefer not to say' },
    ];
    const canContinue = patientName.trim().length > 0 && patientAge.length > 0 && Number(patientAge) > 0;

    return (
      <div className="flex flex-col gap-5">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(9,246,238,0.08)', border: '1px solid rgba(9,246,238,0.2)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
          <h2 className="font-black text-2xl mb-2" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
            About You
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Helps your care team identify and address you
          </p>
        </div>

        <Card>
          <div className="flex flex-col gap-4">
            {/* Name */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>
                First Name <span style={{ color: '#09f6ee' }}>*</span>
              </label>
              <input
                type="text"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="e.g. Sarah"
                autoComplete="given-name"
                className="w-full rounded-xl px-4 py-3 text-base"
                style={{
                  background: 'var(--color-dash-surface)',
                  border: `1px solid ${patientName.trim() ? 'rgba(9,246,238,0.4)' : 'rgba(21,81,80,0.6)'}`,
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
              />
            </div>

            {/* Age */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Age <span style={{ color: '#09f6ee' }}>*</span>
              </label>
              <input
                type="number"
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
                placeholder="e.g. 32"
                min={1}
                max={120}
                className="w-full rounded-xl px-4 py-3 text-base"
                style={{
                  background: 'var(--color-dash-surface)',
                  border: `1px solid ${patientAge && Number(patientAge) > 0 ? 'rgba(9,246,238,0.4)' : 'rgba(21,81,80,0.6)'}`,
                  color: 'var(--color-text-primary)',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
              />
            </div>

            {/* Sex */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-widest mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Biological Sex
              </label>
              <div className="grid grid-cols-2 gap-2">
                {SEX_OPTIONS.map((opt) => (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setPatientSex(opt.value)}
                    className="rounded-xl py-3 text-sm font-semibold transition-all"
                    style={{
                      background: patientSex === opt.value ? 'rgba(9,246,238,0.12)' : 'var(--color-dash-surface)',
                      border: `1.5px solid ${patientSex === opt.value ? 'rgba(9,246,238,0.5)' : 'rgba(21,81,80,0.5)'}`,
                      color: patientSex === opt.value ? '#09f6ee' : 'var(--color-text-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <PrimaryBtn onClick={handleDemographics} disabled={!canContinue} loading={loading}>
          Continue →
        </PrimaryBtn>
      </div>
    );
  }

  function renderConsent() {
    return (
      <div className="flex flex-col gap-5">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(9,246,238,0.08)', border: '1px solid rgba(9,246,238,0.2)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#09f6ee" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
          <h2 className="font-black text-2xl mb-2" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
            Consent & Privacy
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Please read before proceeding
          </p>
        </div>

        <Card>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            By proceeding, you consent to this <strong style={{ color: 'var(--color-text-primary)' }}>AI-assisted triage assessment</strong>. Your responses
            will be reviewed by a licensed clinician. All data is private and auto-deleted when your session closes.
            No personal health information is stored beyond this session without your explicit permission.
          </p>
        </Card>

        <Card>
          <p className="text-xs font-mono uppercase tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>What we collect</p>
          {[
            'Symptoms and health concerns you describe',
            'Vital sign measurements from this kiosk',
            'Time of your visit (de-identified)',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 mb-2">
              <span className="mt-1 w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(9,246,238,0.12)', color: '#09f6ee' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </span>
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{item}</span>
            </div>
          ))}
        </Card>

        <PrimaryBtn onClick={() => setStep('demographics')}>
          I Consent & Continue →
        </PrimaryBtn>
      </div>
    );
  }

  function renderEmergency() {
    return (
      <div className="flex flex-col gap-5">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h2 className="font-black text-2xl mb-2" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
            Safety Check
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Answer honestly — this helps us prioritize your care
          </p>
        </div>

        <Card>
          <p className="font-semibold text-base mb-3" style={{ color: 'var(--color-text-primary)' }}>
            Are you experiencing any of the following right now?
          </p>
          <div className="flex flex-wrap gap-2">
            {['Chest pain', 'Difficulty breathing', 'Severe bleeding', 'Unconsciousness / fainting', 'Throat closing', 'Seizure'].map((s) => (
              <span key={s} className="text-xs px-3 py-1.5 rounded-full"
                style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#fca5a5' }}>
                {s}
              </span>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => handleEmergency('yes')}
            disabled={loading}
            className="w-full rounded-2xl font-bold text-lg transition-all active:scale-95"
            style={{ minHeight: 72, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'monospace' }}
          >
            YES — I need emergency help
          </button>
          <button
            onClick={() => !loading && handleEmergency('no')}
            disabled={loading}
            className="w-full rounded-2xl font-bold text-lg transition-all active:scale-95"
            style={{ minHeight: 72, background: '#16a34a', color: '#fff', border: 'none', cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'monospace' }}
          >
            {loading ? 'Loading…' : 'NO — Continue my assessment'}
          </button>
        </div>
      </div>
    );
  }

  function renderComplaint() {
    return (
      <div className="flex flex-col gap-5">
        <div className="text-center">
          <h2 className="font-black text-2xl mb-2" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
            What brings you in?
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Tap a common concern or type your own below
          </p>
        </div>

        {/* Quick chips */}
        <div className="flex flex-wrap gap-2">
          {COMPLAINT_CHIPS.map((chip) => {
            const isSelected = complaint.toLowerCase().includes(chip.toLowerCase());
            return (
              <button
                key={chip}
                onClick={() => addChip(chip)}
                className="rounded-full px-4 py-2 text-sm font-medium transition-all"
                style={{
                  background: isSelected ? 'rgba(9,246,238,0.15)' : 'var(--color-dash-card)',
                  border: `1px solid ${isSelected ? 'rgba(9,246,238,0.5)' : 'rgba(21,81,80,0.6)'}`,
                  color: isSelected ? '#09f6ee' : 'var(--color-text-secondary)',
                  minHeight: 40,
                }}
              >
                {chip}
              </button>
            );
          })}
        </div>

        {/* Text area */}
        <textarea
          value={complaint}
          onChange={(e) => setComplaint(e.target.value)}
          placeholder="Describe your concern in your own words… e.g. 'I have a sharp pain in my chest since this morning'"
          rows={3}
          className="w-full rounded-xl p-4 text-sm resize-none"
          style={{
            background: 'var(--color-dash-card)',
            border: '1px solid rgba(21,81,80,0.6)',
            color: 'var(--color-text-primary)',
            outline: 'none',
            lineHeight: 1.6,
          }}
        />

        <PrimaryBtn onClick={handleComplaint} disabled={!complaint.trim()} loading={loading}>
          Continue →
        </PrimaryBtn>
      </div>
    );
  }

  function renderPain() {
    return (
      <div className="flex flex-col gap-6">
        <div className="text-center">
          <h2 className="font-black text-2xl mb-2" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
            Rate Your Discomfort
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Tap the number that best describes your pain level right now
          </p>
        </div>

        {/* Scale labels */}
        <div className="flex justify-between px-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span>No pain</span>
          <span>Moderate</span>
          <span>Worst possible</span>
        </div>

        {/* Pain buttons */}
        <div className="flex gap-2 justify-center flex-wrap">
          {PAIN_COLORS.map((color, i) => {
            const level = i + 1;
            const isSelected = painLevel === level;
            return (
              <button
                key={level}
                onClick={() => setPainLevel(level)}
                className="rounded-2xl font-black transition-all"
                style={{
                  width: 60,
                  height: 60,
                  background: isSelected ? color : 'transparent',
                  border: `2.5px solid ${color}`,
                  color: isSelected ? '#051414' : color,
                  fontSize: 20,
                  fontFamily: 'monospace',
                  fontWeight: 900,
                  transform: isSelected ? 'scale(1.15)' : 'scale(1)',
                  boxShadow: isSelected ? `0 0 20px ${color}60` : 'none',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                {level}
              </button>
            );
          })}
        </div>

        {/* Selected level feedback */}
        {painLevel !== null && (
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Selected level:</span>
              <span className="font-black text-lg font-mono" style={{ color: PAIN_COLORS[painLevel - 1], fontFamily: 'monospace' }}>
                {painLevel}/10 — {PAIN_LABELS[painLevel]}
              </span>
            </div>
          </Card>
        )}

        <PrimaryBtn onClick={handlePain} disabled={painLevel === null} loading={loading}>
          Continue →
        </PrimaryBtn>
      </div>
    );
  }

  function renderVitals() {
    const anyDone = bpDone || tempDone || spo2Done;

    return (
      <div className="flex flex-col gap-5">
        <div className="text-center">
          <h2 className="font-black text-2xl mb-2" style={{ color: 'var(--color-text-primary)', fontFamily: 'monospace' }}>
            Vital Sign Measurements
          </h2>
          <p className="text-sm max-w-xs mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            These help us assess your condition more accurately. All are optional — you can skip any.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <VitalRow
            icon={<HeartIcon />}
            label="Blood Pressure"
            unit="mmHg"
            value={bpValue}
            loading={bpLoading}
            error={bpError}
            accentColor="#09f6ee"
            onMeasure={measureBP}
            onSkip={() => setBpDone(true)}
            done={bpDone}
          />
          <VitalRow
            icon={<ThermometerIcon />}
            label="Temperature"
            unit="°C"
            value={tempValue}
            loading={tempLoading}
            error={tempError}
            accentColor="#36c9c5"
            onMeasure={measureTemp}
            onSkip={() => setTempDone(true)}
            done={tempDone}
          />
          <VitalRow
            icon={<DropletIcon />}
            label="Oxygen Saturation (SpO₂)"
            unit="%"
            value={spo2Value}
            loading={spo2Loading}
            error={spo2Error}
            accentColor="#86dfdc"
            onMeasure={measureSpo2}
            onSkip={() => setSpo2Done(true)}
            done={spo2Done}
          />
        </div>

        <div className="flex flex-col gap-3 pt-2">
          <PrimaryBtn onClick={handleFinish}>
            {anyDone ? 'View My Results →' : 'Skip All & View Results →'}
          </PrimaryBtn>
          <p className="text-xs text-center" style={{ color: 'var(--color-text-dim)' }}>
            A clinician will review your triage assessment shortly
          </p>
        </div>
      </div>
    );
  }

  const stepRenderers: Record<Step, () => React.ReactNode> = {
    consent: renderConsent,
    demographics: renderDemographics,
    emergency: renderEmergency,
    complaint: renderComplaint,
    pain: renderPain,
    vitals: renderVitals,
  };

  /* ── Layout ── */
  return (
    <>
      <style>{`
        @keyframes btn-spin { to { transform: rotate(360deg); } }
        @keyframes step-in {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .step-content { animation: step-in 0.25s ease both; }
      `}</style>

      <div className="min-h-screen flex flex-col" style={{ background: 'var(--color-dash-bg)' }}>

        {/* ── Top bar ── */}
        <header
          className="sticky top-0 z-10 flex items-center px-6 h-14 border-b"
          style={{ background: 'rgba(5,20,20,0.95)', borderColor: 'rgba(21,81,80,0.4)', backdropFilter: 'blur(10px)' }}
        >
          <div className="flex items-center gap-2 flex-shrink-0">
            <span style={{ color: '#09f6ee' }}><EcgLine /></span>
            <span className="font-bold text-sm" style={{ fontFamily: 'monospace', color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>
              SmartCare<span style={{ color: '#09f6ee' }}>AI</span>
            </span>
          </div>

          {/* Step label centered */}
          <div className="flex-1 text-center">
            <span className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
              Step {stepIndex + 1} of {STEPS.length} · {STEP_LABELS[stepIndex]}
            </span>
          </div>

          {/* Back button */}
          <button
            onClick={goBack}
            disabled={stepIndex === 0}
            className="flex items-center gap-1.5 text-sm transition-opacity"
            style={{ color: 'var(--color-text-secondary)', opacity: stepIndex === 0 ? 0.2 : 1, background: 'none', border: 'none', cursor: stepIndex === 0 ? 'not-allowed' : 'pointer' }}
          >
            <ArrowLeft /> Back
          </button>
        </header>

        {/* ── Progress bar ── */}
        <div className="h-1 w-full" style={{ background: 'var(--color-dash-surface)' }}>
          <div
            className="h-full transition-all duration-500"
            style={{ width: `${progress}%`, background: 'linear-gradient(90deg, #07c5bf, #09f6ee)' }}
          />
        </div>

        {/* ── Step dot indicators ── */}
        <div className="flex items-center justify-center gap-2 py-4 px-6">
          {STEPS.map((s, i) => {
            const isDone = i < stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="transition-all duration-300 rounded-full flex items-center justify-center text-xs font-mono font-bold"
                  style={{
                    width: isCurrent ? 32 : 24,
                    height: isCurrent ? 32 : 24,
                    background: isDone
                      ? 'rgba(9,246,238,0.15)'
                      : isCurrent
                        ? 'linear-gradient(135deg, #07c5bf, #09f6ee)'
                        : 'rgba(21,81,80,0.4)',
                    color: isDone ? '#09f6ee' : isCurrent ? '#012221' : 'var(--color-text-dim)',
                    border: isDone ? '1.5px solid rgba(9,246,238,0.3)' : isCurrent ? 'none' : '1.5px solid rgba(21,81,80,0.5)',
                    boxShadow: isCurrent ? '0 0 12px rgba(9,246,238,0.3)' : 'none',
                  }}
                >
                  {isDone ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                {i < STEPS.length - 1 && (
                  <div className="h-px w-8 transition-all duration-300"
                    style={{ background: isDone ? 'rgba(9,246,238,0.4)' : 'rgba(21,81,80,0.4)' }} />
                )}
              </div>
            );
          })}
        </div>

        {/* ── Step content ── */}
        <main className="flex-1 flex flex-col items-center justify-start px-6 pb-12">
          <div key={step} className="step-content w-full max-w-lg">
            {stepRenderers[step]()}
          </div>
        </main>

      </div>
    </>
  );
}
