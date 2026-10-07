import type { SecurityCameraRecord } from '../domain/security-camera.types';

export interface VisionLabApi {
  refresh: (cameras: SecurityCameraRecord[]) => void;
  destroy: () => void;
}

export function createVisionLab(
  parent: HTMLElement,
  cameras: SecurityCameraRecord[],
  onOpen: (camera: SecurityCameraRecord) => void,
): VisionLabApi {
  const section = document.createElement('section');
  section.className = 'vision-lab-home';
  section.setAttribute('aria-labelledby', 'vision-lab-title');
  section.innerHTML = `
    <header class="vision-lab-intro">
      <p class="eyebrow">Diseño Mecatrónico · laboratorio</p>
      <h2 id="vision-lab-title">Percepción experimental</h2>
      <p>Selecciona el robot para supervisar la cámara, el reconocimiento facial, los parpadeos y el actuador.</p>
    </header>
    <button type="button" class="vision-lab-asset" data-vision-lab-robot aria-label="Abrir Robot Vision de CAM-ROBOT-01">
      <span class="vision-lab-scene" aria-hidden="true">
        <svg viewBox="0 0 420 260" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path class="vision-lab-guide" d="M40 220h340M60 80h60M300 80h60M210 25v30"/>
          <rect class="vision-lab-machine" x="125" y="55" width="170" height="100" rx="25"/>
          <circle class="vision-lab-lens" cx="210" cy="105" r="30"/>
          <circle class="vision-lab-lens-center" cx="210" cy="105" r="11"/>
          <path class="vision-lab-machine" d="M190 155v30h40v-30M150 220v-20l40-15h40l40 15v20Z"/>
          <circle class="vision-lab-indicator" cx="270" cy="78" r="5"/>
        </svg>
      </span>
      <span class="vision-lab-asset-info">
        <span class="eyebrow">Robot · sistema de percepción</span>
        <strong>CAM-ROBOT-01</strong>
        <span data-vision-lab-camera-name></span>
        <span class="vision-lab-operational" data-vision-lab-camera-status></span>
        <span class="vision-lab-open">Abrir Robot Vision <span aria-hidden="true">→</span></span>
      </span>
    </button>`;
  parent.prepend(section);
  const button = section.querySelector<HTMLButtonElement>('[data-vision-lab-robot]')!;
  const name = section.querySelector<HTMLElement>('[data-vision-lab-camera-name]')!;
  const status = section.querySelector<HTMLElement>('[data-vision-lab-camera-status]')!;
  let camera: SecurityCameraRecord | undefined;
  function refresh(updated: SecurityCameraRecord[]): void {
    camera = updated.find((item) => item.assetCode === 'CAM-ROBOT-01');
    button.disabled = !camera;
    button.dataset.cameraId = camera?.id ?? '';
    name.textContent = camera?.name ?? 'Activo no disponible';
    status.textContent = camera?.status ?? 'Sin registro de cámara';
  }
  button.addEventListener('click', () => { if (camera) onOpen(camera); });
  refresh(cameras);
  return { refresh, destroy: () => section.remove() };
}
