import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
function required(relativePath) {
  const path = resolve(root, relativePath);
  if (!existsSync(path)) throw new Error('Falta: ' + relativePath);
  return readFileSync(path, 'utf8');
}
function check(value, message) { if (!value) throw new Error('White-label invalido: ' + message); }

const config = required('client-config/white-label.ts');
const frontend = required('src/config/white-label.ts');
const guide = required('documentacion/white_label_v1.txt');
const css = required('src/styles/main.css');

for (const term of ['WhiteLabelAssets', 'WhiteLabelTheme', 'logoUrl', 'faviconUrl']) {
  check(config.includes(term), 'falta configuracion ' + term);
}
for (const term of ['applyWhiteLabel', 'client-brand', 'faviconUrl']) {
  check(frontend.includes(term), 'el frontend no aplica ' + term);
}
check(guide.includes('WHITE-LABEL INCLUIDO EN v1.0'), 'no se definio el alcance v1.0');
check(guide.includes('Air Products'), 'falta la referencia solicitada');
check(css.includes('var(--brand-primary'), 'el CSS no usa color primario configurable');
check(css.includes('.client-brand'), 'faltan estilos de marca');

console.log('White-label verificado: nombre, assets, favicon, paleta y guia.');
