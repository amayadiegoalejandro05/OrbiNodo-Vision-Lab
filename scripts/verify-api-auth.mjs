/* global console, process, setTimeout */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: resolve('.env.backend.local'), quiet: true });

async function freePort() {
  const server = createServer();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No hay puerto libre.');
  await new Promise((ok) => server.close(ok));
  return address.port;
}

const port = await freePort();
const baseUrl = `http://127.0.0.1:${port}`;
const api = spawn(process.execPath, [
  resolve('node_modules/tsx/dist/cli.mjs'), resolve('backend/server.ts'),
], { env: { ...process.env, ORBINODO_API_PORT: String(port) }, stdio: 'ignore' });

async function waitForApi() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch { /* todavía está iniciando */ }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('La API temporal no inició correctamente.');
}

async function login(username, password) {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error('Falló el inicio de sesión real.');
  const cookie = response.headers.get('set-cookie') ?? '';
  if (!cookie.includes('HttpOnly') || !cookie.includes('SameSite=Lax')) {
    throw new Error('La cookie no tiene la protección esperada.');
  }
  return cookie.split(';', 1)[0];
}

async function verifySession(cookie, expectedUsername) {
  const headers = { cookie };
  const me = await fetch(`${baseUrl}/api/auth/me`, { headers });
  const body = await me.json();
  if (!me.ok || body.user?.username !== expectedUsername) {
    throw new Error('La sesión no corresponde al perfil esperado.');
  }
  const logout = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers,
  });
  if (logout.status !== 204) throw new Error('Falló logout.');
  const after = await fetch(`${baseUrl}/api/auth/me`, { headers });
  if (after.status !== 401) throw new Error('La sesión siguió activa.');
}

try {
  await waitForApi();
  const engineerPassword = process.env.ORBINODO_SEED_ENGINEER1_PASSWORD;
  const managerPassword = process.env.ORBINODO_SEED_MANAGER_PASSWORD;
  if (!engineerPassword || !managerPassword) {
    throw new Error('Faltan credenciales locales de verificación.');
  }
  const engineerCookie = await login('Ingeniero 1', engineerPassword);
  const managerCookie = await login('Jefe', managerPassword);
  if (engineerCookie === managerCookie) throw new Error('Las sesiones no son únicas.');
  await Promise.all([
    verifySession(engineerCookie, 'Ingeniero 1'),
    verifySession(managerCookie, 'Jefe'),
  ]);
  console.log('Autenticación PostgreSQL verificada con dos sesiones independientes.');
} finally {
  api.kill();
}
