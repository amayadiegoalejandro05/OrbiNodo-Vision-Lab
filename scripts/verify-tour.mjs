/* global console */
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const server = await createServer({
  server: { host: '127.0.0.1', port: 4174, strictPort: true },
});
await server.listen();

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const browser = await chromium.launch({
  executablePath: edgePath,
  headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

const runtimeErrors = [];
page.on('pageerror', (error) => runtimeErrors.push(error.message));
page.on('requestfailed', (request) => {
  runtimeErrors.push(request.url() + ': ' + request.failure()?.errorText);
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForLocation(roomName) {
  await page.waitForFunction(
    (name) => globalThis.document.querySelector('#current-location')?.textContent?.includes(name),
    roomName,
  );
  await page.waitForSelector('.psv-virtual-tour-link');
}

async function readLocation() {
  return (await page.locator('#current-location').textContent())?.trim();
}

async function followArrow(index, expectedRoom) {
  await page.locator('.psv-virtual-tour-link').nth(index).click({ force: true });
  await waitForLocation(expectedRoom);
  return readLocation();
}

async function selectRoom(roomName, floorName) {
  await page
    .getByRole('button', { name: 'Abrir ' + roomName + ', ' + floorName })
    .click();
  await waitForLocation(roomName);
  return readLocation();
}

try {
  await page.goto('http://127.0.0.1:4174/', { waitUntil: 'domcontentloaded' });
  await waitForLocation('Parqueadero');

  // Conserva la prueba de flechas bidireccionales del primer piso.
  const firstFloorRoute = [await readLocation()];
  firstFloorRoute.push(await followArrow(0, 'Pasillo'));
  firstFloorRoute.push(await followArrow(1, 'Cocina'));
  firstFloorRoute.push(await followArrow(0, 'Pasillo'));
  firstFloorRoute.push(await followArrow(0, 'Parqueadero'));

  // Conserva la navegación directa, el estado activo y el teclado de la Fase 4.
  const directRoute = [];
  directRoute.push(await selectRoom('Cocina', 'Primer piso'));
  const kitchenCurrent = await page
    .getByRole('button', { name: 'Abrir Cocina, Primer piso' })
    .getAttribute('aria-current');

  const parkingButton = page.getByRole('button', {
    name: 'Abrir Parqueadero, Primer piso',
  });
  await parkingButton.focus();
  await parkingButton.press('End');
  const endFocused = await page.evaluate(
    () => globalThis.document.activeElement?.textContent?.trim(),
  );
  await page.keyboard.press('ArrowUp');
  const arrowFocused = await page.evaluate(
    () => globalThis.document.activeElement?.textContent?.trim(),
  );
  await page.keyboard.press('Enter');
  await waitForLocation('Cuarto 2 (izquierda)');
  directRoute.push(await readLocation());

  // La Fase 5 recorre las escaleras y prueba por separado las ramas derecha e izquierda.
  const secondFloorRoute = [];
  secondFloorRoute.push(
    await selectRoom('Escalera inferior', 'Primer piso'),
  );
  secondFloorRoute.push(await followArrow(1, 'Escalera superior'));
  secondFloorRoute.push(await followArrow(1, 'Cuarto 1 (derecha)'));
  secondFloorRoute.push(await followArrow(0, 'Escalera superior'));
  secondFloorRoute.push(await followArrow(2, 'Cuarto 2 (izquierda)'));
  secondFloorRoute.push(await followArrow(1, 'Estudio'));
  secondFloorRoute.push(await followArrow(0, 'Cuarto 2 (izquierda)'));
  secondFloorRoute.push(await followArrow(0, 'Escalera superior'));
  secondFloorRoute.push(await followArrow(0, 'Escalera inferior'));

  await page.getByRole('button', { name: 'Volver al inicio' }).click();
  await waitForLocation('Parqueadero');
  directRoute.push(await readLocation());

  const activeMenuText = await page
    .locator('.location-link[aria-current="location"]')
    .textContent();
  const menuItems = await page.locator('.location-link').count();
  const floorGroups = await page.locator('.location-group').count();
  const visibleText = await page.locator('body').innerText();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileMenuVisible = await page.locator('#location-menu').isVisible();
  const mobileHomeVisible = await page.locator('#go-home').isVisible();
  await page.screenshot({ path: 'fase5-verificacion.png', fullPage: true });

  const result = {
    firstFloorRoute,
    directRoute,
    secondFloorRoute,
    menuItems,
    floorGroups,
    kitchenCurrent,
    activeMenuText: activeMenuText?.trim(),
    keyboard: { endFocused, arrowFocused },
    mobile: { menuVisible: mobileMenuVisible, homeVisible: mobileHomeVisible },
    mojibake: (visibleText.match(/Ã|Â|â€/g) ?? []).length,
    runtimeErrors,
  };

  assert(runtimeErrors.length === 0, 'Se encontraron errores del navegador.');
  assert(result.mojibake === 0, 'Se encontraron caracteres dañados.');
  assert(menuItems === 8, 'El menú no contiene los ocho panoramas.');
  assert(floorGroups === 2, 'El menú no contiene los dos pisos.');
  assert(kitchenCurrent === 'location', 'Cocina no quedó marcada como activa.');
  assert(endFocused === 'Estudio', 'La tecla Fin no enfocó el último ambiente.');
  assert(
    arrowFocused === 'Cuarto 2 (izquierda)',
    'La flecha superior no movió el foco al ambiente anterior.',
  );
  assert(activeMenuText?.trim() === 'Parqueadero', 'Inicio no sincronizó el menú.');
  assert(mobileMenuVisible && mobileHomeVisible, 'Los controles no son visibles en móvil.');

  console.log(JSON.stringify(result, null, 2));
} finally {
  await browser.close();
  await server.close();
}
