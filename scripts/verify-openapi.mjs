import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const documentPath = resolve(projectRoot, 'documentacion/openapi/orbinodo-api-v1.json');
const document = JSON.parse(readFileSync(documentPath, 'utf8'));
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8'));
const version = packageJson.version;
const routeFiles = [
  ['backend/app.ts', ''],
  ['backend/routes/auth-routes.ts', '/api/auth'],
  ['backend/routes/camera-routes.ts', '/api/cameras'],
  ['backend/routes/audit-routes.ts', '/api/audit'],
];
const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);

function assertCondition(condition, message) {
  if (!condition) throw new Error(`OpenAPI invalido: ${message}`);
}

function routeKey(method, path) {
  const normalizedPath = path.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, '{$1}').replace(/\/$/, '') || '/';
  return `${method.toUpperCase()} ${normalizedPath}`;
}

const codeRoutes = new Set();
for (const [file, prefix] of routeFiles) {
  const source = readFileSync(resolve(projectRoot, file), 'utf8');
  for (const match of source.matchAll(/app\.(get|post|put|patch|delete)\('([^']+)'/g)) {
    codeRoutes.add(routeKey(match[1], `${prefix}${match[2]}`));
  }
}

const documentedRoutes = new Set();
for (const [path, item] of Object.entries(document.paths ?? {})) {
  assertCondition(item && typeof item === 'object', `path invalido: ${path}`);
  for (const [method, operation] of Object.entries(item)) {
    if (httpMethods.has(method)) {
      assertCondition(operation && typeof operation === 'object', `${method.toUpperCase()} ${path} no tiene operacion`);
      documentedRoutes.add(routeKey(method, path));
      assertCondition(Object.keys(operation.responses ?? {}).length > 0, `${method.toUpperCase()} ${path} no documenta respuestas`);
    }
  }
  if (item.get) assertCondition(item.head, `GET ${path} debe documentar HEAD`);
}

assertCondition(document.openapi === '3.1.0', 'se requiere OpenAPI 3.1.0');
assertCondition(document.info?.version === version, 'la version del contrato no coincide con package.json.');
assertCondition(codeRoutes.size === documentedRoutes.size, 'el numero de rutas no coincide con Fastify');
for (const route of codeRoutes) assertCondition(documentedRoutes.has(route), `falta documentar ${route}`);
for (const route of documentedRoutes) assertCondition(codeRoutes.has(route), `OpenAPI contiene ruta inexistente: ${route}`);

const expectedResponses = {
  'GET /api/health': ['200', '426', '503'],
  'GET /api/live': ['200', '426'],
  'POST /api/auth/login': ['200', '400', '401', '413', '415', '429', '500', '426'],
  'GET /api/auth/me': ['200', '401', '500', '426'],
  'POST /api/auth/logout': ['204', '500', '426'],
  'GET /api/cameras': ['200', '401', '500', '426'],
  'GET /api/cameras/{id}': ['200', '400', '401', '404', '500', '426'],
  'PATCH /api/cameras/{id}/operations': ['200', '400', '401', '403', '404', '409', '413', '415', '500', '426'],
  'GET /api/audit/access-sessions': ['200', '401', '403', '500', '426'],
  'GET /api/audit/camera-changes': ['200', '400', '401', '403', '500', '426'],
};
for (const [route, statuses] of Object.entries(expectedResponses)) {
  const [method, path] = route.split(' ');
  const responses = document.paths[path]?.[method.toLowerCase()]?.responses ?? {};
  for (const status of statuses) assertCondition(status in responses, `${route} no documenta ${status}`);
}

const sourceErrorCodes = [...readFileSync(resolve(projectRoot, 'backend/api-error.ts'), 'utf8').matchAll(/^\s*\| '([^']+)'/gm)].map((match) => match[1]).sort();
const documentedErrorCodes = [...(document.components?.schemas?.ApiError?.properties?.error?.enum ?? [])].sort();
assertCondition(JSON.stringify(sourceErrorCodes) === JSON.stringify(documentedErrorCodes), 'ApiError no coincide con backend/api-error.ts');
assertCondition(document.components?.securitySchemes?.cookieAuth?.in === 'cookie', 'falta autenticacion por cookie');
assertCondition(document.components.securitySchemes.cookieAuth.name === 'orbinodo_session', 'nombre de cookie incorrecto');
for (const schema of ['LoginRequest', 'Camera', 'CameraOperationsRequest', 'AccessSession', 'CameraChange']) {
  assertCondition(document.components?.schemas?.[schema], `falta schema ${schema}`);
}
assertCondition(document.components.schemas.LoginRequest.properties.password.writeOnly === true, 'password debe ser writeOnly');
assertCondition(document.paths['/api/auth/login'].post.requestBody.content['application/json'].example, 'falta ejemplo de login');
assertCondition(document.paths['/api/cameras/{id}/operations'].patch.requestBody.content['application/json'].example, 'falta ejemplo de actualizacion');
assertCondition(document.components.schemas.ApiError.example, 'falta ejemplo de error');

console.log(`OpenAPI verificado: ${codeRoutes.size} rutas Fastify, ${documentedErrorCodes.length} codigos de error y schemas de autenticacion, camaras y auditoria.`);
