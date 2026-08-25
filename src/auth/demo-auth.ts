export type DemoRole = 'programmer' | 'manager' | 'engineer1' | 'engineer2';

export interface DemoSession {
  role: DemoRole;
  displayName: string;
  username: string;
}

function isRole(value: unknown): value is DemoRole {
  return value === 'programmer' || value === 'manager'
    || value === 'engineer1' || value === 'engineer2';
}

function readSession(value: unknown): DemoSession | null {
  if (!value || typeof value !== 'object') return null;
  const user = (value as { user?: unknown }).user;
  if (!user || typeof user !== 'object') return null;
  const candidate = user as Partial<DemoSession>;
  return isRole(candidate.role)
    && typeof candidate.displayName === 'string'
    && typeof candidate.username === 'string'
    ? { role: candidate.role, displayName: candidate.displayName, username: candidate.username }
    : null;
}

export async function authenticateWithApi(
  username: string,
  password: string,
): Promise<DemoSession | null> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const value = await readApiJson(response);
  if (response.status === 401) return null;
  if (!response.ok) throw apiFailure(value, 'La API local no está disponible.');
  const session = readSession(value);
  if (!session) throw new Error('La API devolvió un perfil no válido.');
  return session;
}

export async function getActiveApiSession(): Promise<DemoSession | null> {
  const response = await fetch('/api/auth/me', { credentials: 'include' });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error('La API local no está disponible.');
  const session = readSession(await readApiJson(response));
  if (!session) throw new Error('La API devolvió un perfil no válido.');
  return session;
}

export async function endApiSession(): Promise<void> {
  const response = await fetch('/api/auth/logout', {
    method: 'POST', credentials: 'include',
  });
  if (!response.ok) throw apiFailure(
    await readApiJson(response), 'No fue posible cerrar la sesión.',
  );
}
import { apiFailure, readApiJson } from '../api/api-response';
