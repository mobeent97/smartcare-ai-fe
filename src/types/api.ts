export interface TriageSession {
  id: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ROUTED';
  ctas_level: 1 | 2 | 3 | 4 | 5 | null;
  akool_session_id: string | null;
  avatar_mode: 'NURSE' | 'DOCTOR';
  red_flags: string[] | null;
  reasoning_summary: string | null;
  patient_name: string | null;
  patient_age: number | null;
  patient_sex: string | null;
  ctas_assigned_at: string | null;
  triage_completed_at: string | null;
  escalated: boolean;
  routing_specialty: string | null;
  answers?: TriageAnswer[];
  measurements?: DeviceMeasurement[];
  audit_events?: AuditEvent[];
  created_at: string;
  updated_at: string;
}

export interface DeteriorationAlert {
  sessionId: string;
  patientName: string | null;
  oldCtas: number;
  newCtas: number;
  waitMinutes: number;
  reason: string;
}

export interface DashboardMetrics {
  total_sessions: number;
  avg_triage_time_minutes: number | null;
  avg_wait_time_minutes: number | null;
  ctas_distribution: Record<string, number>;
  red_flag_rate: number;
  escalation_count: number;
  escalation_rate: number;
  specialty_distribution: Record<string, number>;
}

export interface TriageAnswer {
  id: string;
  step_name: string;
  raw_input: string;
  parsed_data: Record<string, unknown>;
  created_at: string;
}

export interface DeviceMeasurement {
  id: string;
  device_type: 'BLOOD_PRESSURE' | 'TEMPERATURE' | 'OXIMETER';
  raw_readings: Record<string, number>;
  classification: string;
  timestamp: string;
}

export interface AuditEvent {
  id: string;
  event_type: string;
  description: string;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface AvatarSessionResponse {
  // 'video' returns only provider+session_id; 'akool' returns agora_* creds;
  // 'heygen' returns token+avatar_id+voice_id+quality.
  provider?: 'video' | 'akool' | 'heygen';
  session_id: string;
  // akool (live streaming over Agora)
  agora_app_id?: string;
  agora_channel?: string;
  agora_token?: string;
  agora_uid?: number;
  mode?: 'live' | 'mock';
  // heygen (LiveKit streaming token)
  token?: string;
  avatar_id?: string;
  voice_id?: string;
  quality?: string;
}

export interface SubmitAnswerResponse {
  next_step: string;
  next_question: string | null;
  avatar_speech_text: string;
  ctas_level: number | null;
  routing_specialty: string | null;
}

export interface ApiResponse<T> {
  status: number;
  message: string;
  data: T;
}

export interface AuthTokens {
  access: string;
  refresh: string;
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  date_joined: string;
}

export interface MetricsTimeseries {
  days: number;
  total_in_period: number;
  avg_triage_time_minutes: number | null;
  daily_sessions: { date: string; count: number }[];
  ctas_breakdown: Record<string, number>;
}
