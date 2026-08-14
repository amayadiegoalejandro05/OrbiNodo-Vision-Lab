export type AuthRole = 'programmer' | 'manager' | 'engineer1' | 'engineer2';

export interface AuthUser {
  username: string;
  displayName: string;
  role: AuthRole;
}

export interface LoginResult {
  token: string;
  user: AuthUser;
  expiresAt: Date;
}

export interface AuthService {
  login(username: string, password: string): Promise<LoginResult | null>;
  getSession(token: string): Promise<AuthUser | null>;
  logout(token: string): Promise<void>;
}
