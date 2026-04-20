import type { DeviceMeasurement } from '@/types/api';
import { VitalCard } from './VitalCard';
import { classifyBp, classifyTemp, classifyHr, classifySpo2 } from '@/lib/dashboard-utils';

interface VitalsPanelProps {
  measurements: DeviceMeasurement[];
}

export function VitalsPanel({ measurements }: VitalsPanelProps) {
  const bp = measurements.find((m) => m.device_type === 'BLOOD_PRESSURE');
  const temp = measurements.find((m) => m.device_type === 'TEMPERATURE');
  const oximeter = measurements.find((m) => m.device_type === 'OXIMETER');

  const systolic = bp?.raw_readings?.systolic;
  const diastolic = bp?.raw_readings?.diastolic;
  const tempF = temp?.raw_readings?.temperature ?? temp?.raw_readings?.value;
  const hr = oximeter?.raw_readings?.heart_rate ?? bp?.raw_readings?.heart_rate;
  const spo2 = oximeter?.raw_readings?.spo2;

  const sysCls = classifyBp(systolic);
  const tempCls = classifyTemp(tempF);
  const hrCls = classifyHr(hr);
  const spo2Cls = classifySpo2(spo2);

  // SVG Icons to replace emojis
  const BPIcon = (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.5" className="h-full w-full">
      <path d="M14.5 19H12a5 5 0 0 1-5-5V7a3 3 0 0 1 6 0v7M16 4h4" stroke="#a855f7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="7" r="3" stroke="#22d3ee" />
      <circle cx="7" cy="14" r="3" stroke="#a855f7" />
    </svg>
  );

  const TempIcon = (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="h-full w-full" stroke="#22d3ee">
      <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
      <path d="M11.5 7v6" strokeLinecap="round" />
    </svg>
  );

  const HRIcon = (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="h-full w-full relative -top-0.5">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill="url(#hr-grad)" />
      <polyline points="9 11.5 10.5 11.5 11.5 8 13.5 15.5 14.5 11.5 16 11.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="hr-grad" x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f43f5e" />
          <stop offset="1" stopColor="#a855f7" />
        </linearGradient>
      </defs>
    </svg>
  );

  const SPO2Icon = (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" className="h-full w-full relative -top-0.5">
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" fill="url(#spo2-grad)" />
      <defs>
        <linearGradient id="spo2-grad" x1="4" y1="5" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#22d3ee" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
    </svg>
  );

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <VitalCard
        label="Blood Pressure"
        icon={BPIcon}
        value={systolic && diastolic ? `${systolic}/${diastolic}` : '—'}
        unit="mmHg"
        classification={bp?.classification ?? sysCls.label}
        tone={sysCls.tone}
        fillPct={systolic ? ((systolic - 70) / (190 - 70)) * 100 : null}
      />
      <VitalCard
        label="Temperature"
        icon={TempIcon}
        value={tempF != null ? `${tempF}` : '—'}
        unit="°C"
        classification={temp?.classification ?? tempCls.label}
        tone={tempCls.tone}
        fillPct={tempF != null ? ((tempF - 95) / (104 - 95)) * 100 : null}
      />
      <VitalCard
        label="Heart Rate"
        icon={HRIcon}
        value={hr != null ? `${hr}` : '—'}
        unit="bpm"
        classification={hrCls.label}
        tone={hrCls.tone}
        fillPct={hr != null ? ((hr - 40) / (200 - 40)) * 100 : null}
      />
      <VitalCard
        label="SPO₂"
        icon={SPO2Icon}
        value={spo2 != null ? `${spo2}` : '—'}
        unit="%"
        classification={spo2Cls.label}
        tone={spo2Cls.tone}
        fillPct={spo2 != null ? ((spo2 - 80) / (100 - 80)) * 100 : null}
      />
    </div>
  );
}

