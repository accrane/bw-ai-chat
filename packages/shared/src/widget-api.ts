import type { Branding } from './branding.js';

/** GET /v1/widget/:slug/config */
export interface WidgetConfigResponse {
  clientId: string;
  name: string;
  branding: Branding;
}

/** POST /v1/widget/:slug/session */
export interface WidgetSessionResponse {
  token: string;
  sessionId: string;
  expiresAt: string;
}

/** Error envelope returned by every API error response. */
export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    requestId?: string;
  };
}
