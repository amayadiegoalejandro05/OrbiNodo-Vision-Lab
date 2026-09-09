/* global console, process, setTimeout */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import pg from 'pg';
import { loadVisionLabVerificationConfig } from './vision-lab-verification-config.mjs';

const { Pool } = pg;
const config = loadVisionLabVerificationConfig();
const { accounts, camera, environment } = config;
const database = new Pool({ connectionString: environment.DATABASE_URL, max: 1 });

async function freePort() {
  const server = createServer();
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No hay puerto libre.');
  await new Promise((ok) => server.close(ok));
  return address.port;
}

const port = await freePort();
const baseUrl = 'http://127.0.0.1:' + port;
const api = spawn(process.execPath, [
  resolve('node_modules/tsx/dist/cli.mjs'), resolve('backend/server.ts'),
], { env: { ...process.env, ...environment, ORBINODO_API_PORT: String(port) }, stdio: 'ignore' });

async function waitForApi() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(baseUrl + '/api/health');
      if (response.ok) return;
    } catch { /* API is starting. */ }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  throw new Error('La API temporal no inicio correctamente.');
}

async function login(account) {
  const response = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: account.username, password: account.password }),
  });
  if (!response.ok) throw new Error('Fallo el inicio de sesion Vision Lab.');
  const cookie = response.headers.get('set-cookie') ?? '';
  if (!cookie.includes('HttpOnly') || !cookie.includes('SameSite=Lax')) {
    throw new Error('La cookie no tiene la proteccion esperada.');
  }
  return cookie.split(';', 1)[0];
}

async function verifySession(cookie, account) {
  const headers = { cookie };
  const me = await fetch(baseUrl + '/api/auth/me', { headers });
  const body = await me.json();
  if (!me.ok || body.user?.username !== account.username) throw new Error('La sesion no corresponde al perfil Vision Lab.');
  const logout = await fetch(baseUrl + '/api/auth/logout', { method: 'POST', headers });
  if (logout.status !== 204) throw new Error('Fallo el cierre de sesion.');
  if ((await fetch(baseUrl + '/api/auth/me', { headers })).status !== 401) {
    throw new Error('La sesion siguio activa.');
  }
}

try {
  await waitForApi();
  const operatorCookie = await login(accounts.engineer1);
  const supervisorCookie = await login(accounts.manager);
  if (operatorCookie === supervisorCookie) throw new Error('Las sesiones no son unicas.');

  const inventory = await (await fetch(baseUrl + '/api/cameras', { headers: { cookie: operatorCookie } })).json();
  if (!Array.isArray(inventory.cameras) || inventory.cameras.length !== 1 || inventory.cameras[0]?.assetCode !== camera.assetCode) {
    throw new Error('El inventario Vision Lab no contiene el activo minimo esperado.');
  }
  const forbidden = await fetch(baseUrl + '/api/cameras/' + camera.id + '/operations', {
    method: 'PATCH', headers: { cookie: supervisorCookie, 'content-type': 'application/json' }, body: '{}',
  });
  if (forbidden.status !== 403) throw new Error('El supervisor pudo editar el activo.');
  if ((await fetch(baseUrl + '/api/audit/camera-changes', { headers: { cookie: operatorCookie } })).status !== 403) {
    throw new Error('El operador pudo consultar auditoria privada.');
  }
  const accessAudit = await fetch(baseUrl + '/api/audit/access-sessions', { headers: { cookie: supervisorCookie } });
  const changeAudit = await fetch(baseUrl + '/api/audit/camera-changes', { headers: { cookie: supervisorCookie } });
  if (!accessAudit.ok || !changeAudit.ok) throw new Error('El supervisor no pudo consultar auditoria.');

  await Promise.all([verifySession(operatorCookie, accounts.engineer1), verifySession(supervisorCookie, accounts.manager)]);
  const sessionView = await database.query('SELECT * FROM vista_historial_accesos LIMIT 1');
  if (sessionView.fields.map(({ name }) => name).join('|') !== 'usuario|entrada|salida|estado|duracion') {
    throw new Error('La vista de sesiones no tiene las columnas esperadas.');
  }
  const changeView = await database.query('SELECT * FROM vista_historial_cambios LIMIT 1');
  if (changeView.fields.map(({ name }) => name).join('|') !== 'Ingeniero|Cámara|Código|Campo|Valor anterior|Valor nuevo|Fecha') {
    throw new Error('La vista de cambios no tiene las columnas esperadas.');
  }
  const persisted = await database.query({
    text: 'SELECT array_agg(DISTINCT actor_username) AS actors FROM camera_change_history WHERE camera_id = $1',
    values: [camera.id],
  });
  const actors = persisted.rows[0]?.actors ?? [];
  if (!actors.includes(accounts.engineer1.username) || !actors.includes(accounts.engineer2.username)) {
    throw new Error('No se conservaron ambos operadores Vision Lab en el historial.');
  }
  console.log('Autenticacion, RBAC, sesiones, auditoria y vistas Vision Lab verificados.');
} finally {
  api.kill();
  await database.end();
}
