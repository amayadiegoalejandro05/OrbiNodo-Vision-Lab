const baseUrl = (process.argv[2] || 'https://orbinodo-demo.vercel.app').replace(/\/$/, '');

function ensure(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, options = {}, cookie = '') {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('content-type', 'application/json');
  if (cookie) headers.set('cookie', cookie);
  const response = await fetch(baseUrl + path, { ...options, headers });
  const text = response.status === 204 ? '' : await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = null; }
  }
  return { response, body };
}

async function verifyProfile(username, password, expectedRole, auditStatus) {
  ensure(password, 'Falta la contraseña local de ' + username + '.');
  const login = await request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password }),
  });
  ensure(login.response.status === 200, 'Falló el acceso de ' + username + ' (HTTP ' + login.response.status + ').');
  ensure(login.body, 'El acceso no devolvió JSON para ' + username + '.');
  ensure(login.body.user.role === expectedRole, 'Rol inesperado para ' + username + '.');
  const setCookie = login.response.headers.get('set-cookie') || '';
  ensure(setCookie.includes('Secure') && setCookie.includes('HttpOnly')
    && setCookie.includes('SameSite=Lax'), 'La cookie productiva no tiene las protecciones esperadas.');
  const cookie = setCookie.split(';')[0];
  ensure(cookie, 'La API no entregó cookie de sesión para ' + username + '.');

  const me = await request('/api/auth/me', {}, cookie);
  ensure(me.response.status === 200, 'La sesión no quedó activa para ' + username + '.');

  const cameras = await request('/api/cameras', {}, cookie);
  ensure(cameras.response.status === 200, 'No se pudieron leer cámaras con ' + username + '.');
  ensure(cameras.body.cameras.length === 10, 'Producción no contiene las 10 cámaras.');

  const audit = await request('/api/audit/access-sessions', {}, cookie);
  ensure(audit.response.status === auditStatus, 'Permiso de auditoría incorrecto para ' + username + '.');

  const logout = await request('/api/auth/logout', { method: 'POST' }, cookie);
  ensure(logout.response.status === 204, 'Falló el cierre de sesión de ' + username + '.');
  const afterLogout = await request('/api/auth/me', {}, cookie);
  ensure(afterLogout.response.status === 401, 'La sesión siguió válida tras salir: ' + username + '.');
}

try {
  const health = await request('/api/health');
  const live = await request('/api/live');
  ensure(live.response.status === 200, 'Liveness de produccion no responde 200.');
  ensure(live.body?.status === 'ok' && live.body?.service === 'api',
    'Liveness de produccion no devolvio el estado esperado.');
  ensure(health.response.status === 200, 'La salud de producción no responde 200.');
  ensure(health.body.database === 'available', 'Neon no está disponible.');
  ensure(new URL(baseUrl).protocol === 'https:', 'La verificacion exige una URL HTTPS.');
  ensure((health.response.headers.get('strict-transport-security') || '').includes('max-age='),
    'Produccion no entrego Strict-Transport-Security.');
  for (const [header, expected] of [
    ['cache-control', 'no-store'],
    ['x-content-type-options', 'nosniff'],
    ['x-frame-options', 'DENY'],
    ['referrer-policy', 'no-referrer'],
    ['cross-origin-resource-policy', 'same-origin'],
  ]) {
    ensure((health.response.headers.get(header) || '').includes(expected),
      'Produccion no entrego el header de seguridad ' + header + '.');
  }
  const httpUrl = new URL(baseUrl);
  httpUrl.protocol = 'http:';
  const redirect = await fetch(httpUrl, { redirect: 'manual' });
  ensure([301, 302, 307, 308].includes(redirect.status), 'HTTP no redirige a HTTPS.');
  ensure((redirect.headers.get('location') || '').startsWith('https://'),
    'La redireccion HTTP no apunta a HTTPS.');
  await verifyProfile('Jefe', process.env.ORBINODO_SEED_MANAGER_PASSWORD, 'manager', 200);
  await verifyProfile('Ingeniero 1', process.env.ORBINODO_SEED_ENGINEER1_PASSWORD, 'engineer1', 403);
  console.log('Producción verificada: salud, Neon, 10 cámaras, sesiones y permisos.');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Falló la verificación de producción.');
  process.exitCode = 1;
}
