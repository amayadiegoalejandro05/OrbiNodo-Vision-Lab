export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA_TYPE'
  | 'HTTPS_REQUIRED'
  | 'INVALID_CREDENTIALS'
  | 'LOGIN_RATE_LIMITED'
  | 'SESSION_REQUIRED'
  | 'FORBIDDEN_ROLE'
  | 'CAMERA_NOT_FOUND'
  | 'ROUTE_NOT_FOUND'
  | 'RESOURCE_CONFLICT'
  | 'INTERNAL_ERROR'
  | 'DATABASE_UNAVAILABLE';

export interface ApiErrorBody {
  error: ApiErrorCode;
  message: string;
}

export function apiError(error: ApiErrorCode, message: string): ApiErrorBody {
  return { error, message };
}
