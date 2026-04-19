export interface TriageSession {
  id: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ROUTED';
  ctas_level: 1 | 2 | 3 | 4 | 5 | null;
  akool_session_id: string | null;
  avatar_mode: 'NURSE' | 'DOCTOR';
  red_flags: string[] | null;
  reasoning_summary: string | null;
  answers?: TriageAnswer[];
  measurements?: DeviceMeasurement[];
  audit_events?: AuditEvent[];
  created_at: string;
  updated_at: string;
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
  device_type: 'BLOOD_PRESSURE' | 'TEMPERATURE';
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
  session_id: string;
  agora_app_id?: string;
  agora_channel: string;
  agora_token?: string;
  agora_uid: number;
  mode: 'live' | 'mock';
}

export interface SubmitAnswerResponse {
  next_step: string;
  avatar_speech_text: string;
}

export interface ApiResponse<T> {
  status: number;
  message: string;
  data: T;
}

export interface AuthTokens {
  access: string;
  refresh: string;
}
