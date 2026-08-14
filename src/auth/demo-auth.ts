// Esta barrera sirve para una demostración con material público. No sustituye
// autenticación de servidor: las variables VITE quedan incluidas en el navegador.
const SESSION_KEY = 'orbinodo-demo-session';

export type DemoRole = 'programmer' | 'manager' | 'engineer1' | 'engineer2';

export interface DemoAccount {
  role: DemoRole;
  displayName: string;
  username: string;
  passwordHash: string;
}

export interface DemoSession {
  role: DemoRole;
  displayName: string;
  username: string;
}

// La cuenta existente sigue siendo Orbinodo. Las tres cuentas nuevas pueden
// recibir hashes propios; mientras falten, comparten temporalmente el hash de
// la demo para permitir probar los permisos sin exponer la contraseña.
export function readDemoAccounts(): DemoAccount[] {
  const programmerHash = import.meta.env.VITE_DEMO_PASSWORD_SHA256?.trim().toLowerCase() ?? '';
  const fallbackHash = (value: string | undefined) => value?.trim().toLowerCase() || programmerHash;
  return [
    {
      role: 'programmer',
      displayName: 'Orbinodo',
      username: import.meta.env.VITE_DEMO_USERNAME?.trim() ?? '',
      passwordHash: programmerHash,
    },
    {
      role: 'manager',
      displayName: 'Jefe',
      username: import.meta.env.VITE_DEMO_MANAGER_USERNAME?.trim() || 'Jefe',
      passwordHash: fallbackHash(import.meta.env.VITE_DEMO_MANAGER_PASSWORD_SHA256),
    },
    {
      role: 'engineer1',
      displayName: 'Ingeniero 1',
      username: import.meta.env.VITE_DEMO_ENGINEER_1_USERNAME?.trim() || 'Ingeniero 1',
      passwordHash: fallbackHash(import.meta.env.VITE_DEMO_ENGINEER_1_PASSWORD_SHA256),
    },
    {
      role: 'engineer2',
      displayName: 'Ingeniero 2',
      username: import.meta.env.VITE_DEMO_ENGINEER_2_USERNAME?.trim() || 'Ingeniero 2',
      passwordHash: fallbackHash(import.meta.env.VITE_DEMO_ENGINEER_2_PASSWORD_SHA256),
    },
  ];
}

export function isConfiguredDemoAccount(account: DemoAccount): boolean {
  return account.username.length > 0 && /^[a-f0-9]{64}$/.test(account.passwordHash);
}

export function hasDemoAccounts(accounts: DemoAccount[]): boolean {
  return accounts.some(isConfiguredDemoAccount);
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function authenticateDemo(
  enteredUsername: string,
  enteredPassword: string,
  accounts: DemoAccount[],
): Promise<DemoSession | null> {
  const enteredHash = await sha256(enteredPassword);
  const account = accounts.find((candidate) =>
    isConfiguredDemoAccount(candidate)
    && enteredUsername.trim() === candidate.username
    && enteredHash === candidate.passwordHash,
  );
  return account
    ? { role: account.role, displayName: account.displayName, username: account.username }
    : null;
}

function isDemoRole(value: unknown): value is DemoRole {
  return value === 'programmer' || value === 'manager' || value === 'engineer1' || value === 'engineer2';
}

export function getActiveDemoSession(): DemoSession | null {
  const stored = sessionStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    const session = JSON.parse(stored) as Partial<DemoSession>;
    return isDemoRole(session.role) && typeof session.displayName === 'string' && typeof session.username === 'string'
      ? { role: session.role, displayName: session.displayName, username: session.username }
      : null;
  } catch {
    return null;
  }
}

export function startDemoSession(session: DemoSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function endDemoSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem('orbinodo-demo-role');
  sessionStorage.removeItem('orbinodo-demo-authenticated');
}
