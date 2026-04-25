import axios, { AxiosInstance } from 'axios';
import type {
  ApiResponse, TriageSession, AvatarSessionResponse,
  SubmitAnswerResponse, DeviceMeasurement, AuthTokens,
} from '@/types/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1';

class ApiClient {
  private client: AxiosInstance;
  private accessToken: string | null = null;

  constructor() {
    this.client = axios.create({ baseURL: BASE_URL });
    this.client.interceptors.request.use((config) => {
      if (this.accessToken) {
        config.headers.Authorization = `Bearer ${this.accessToken}`;
      }
      return config;
    });
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  clearTokens() {
    this.accessToken = null;
  }

  // Auth
  async login(email: string, password: string) {
    const res = await this.client.post<ApiResponse<AuthTokens>>('/auth/login/', { email, password });
    return res.data;
  }

  async refreshToken(refresh: string) {
    const res = await this.client.post<ApiResponse<{ access: string }>>('/auth/token/refresh/', { refresh });
    return res.data;
  }

  // Triage (booth — unauthenticated)
  async createTriageSession() {
    const res = await this.client.post<ApiResponse<TriageSession>>('/triage/sessions/');
    return res.data;
  }

  async createAvatarSession(sessionId: string, avatarType: 'nurse' | 'doctor' = 'nurse') {
    const res = await this.client.post<ApiResponse<AvatarSessionResponse>>('/triage/avatar/session/', {
      session_id: sessionId,
      avatar_type: avatarType,
    });
    return res.data;
  }

  async sendAvatarMessage(akoolSessionId: string, text: string, sessionId: string) {
    const res = await this.client.post('/triage/avatar/speak/', { akool_session_id: akoolSessionId, text, session_id: sessionId });
    return res.data;
  }

  async closeAvatarSession(akoolSessionId: string, sessionId: string) {
    const res = await this.client.post('/triage/avatar/session/close/', {
      akool_session_id: akoolSessionId,
      session_id: sessionId,
    });
    return res.data;
  }

  async getAvatarSessionStatus(akoolSessionId: string) {
    const res = await this.client.get<ApiResponse<unknown>>('/triage/avatar/session/status/', {
      params: { akool_session_id: akoolSessionId },
    });
    return res.data;
  }

  async submitAnswer(sessionId: string, step: string, value: string) {
    const res = await this.client.post<ApiResponse<SubmitAnswerResponse>>(
      `/triage/sessions/${sessionId}/answer/`,
      { step, value }
    );
    return res.data;
  }

  // Devices
  async triggerMeasurement(sessionId: string, deviceType: 'BLOOD_PRESSURE' | 'TEMPERATURE' | 'OXIMETER') {
    const res = await this.client.post<ApiResponse<DeviceMeasurement>>('/devices/measure/', {
      session_id: sessionId,
      device_type: deviceType,
    });
    return res.data;
  }

  // Dashboard (authenticated)
  async getQueue() {
    const res = await this.client.get<ApiResponse<TriageSession[]>>('/dashboard/queue/');
    return res.data;
  }

  async getCaseDetail(caseId: string) {
    const res = await this.client.get<ApiResponse<TriageSession>>(`/dashboard/cases/${caseId}/`);
    return res.data;
  }

  async executeAction(caseId: string, actionType: 'OVERRIDE_CTAS' | 'MARK_SEEN', payload?: Record<string, unknown>) {
    const res = await this.client.post(`/dashboard/cases/${caseId}/action/`, {
      action_type: actionType,
      ...payload,
    });
    return res.data;
  }

  async deleteCase(caseId: string) {
    const res = await this.client.delete(`/dashboard/cases/${caseId}/delete/`);
    return res.data;
  }
}

export const api = new ApiClient();
