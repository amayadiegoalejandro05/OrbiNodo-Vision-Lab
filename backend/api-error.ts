export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'INVALID_CREDENTIALS'
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
