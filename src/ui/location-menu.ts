import type { TourConfig } from '../domain/tour.types';

export interface LocationMenuApi {
  setActivePanorama: (panoramaId: string) => void;
  destroy: () => void;
}

// El menú se genera desde el mismo modelo del visor para no duplicar rutas.
export function createLocationMenu(
  container: HTMLElement,
  tour: TourConfig,
  onNavigate: (panoramaId: string) => void,
): LocationMenuApi {
  const buttons: HTMLButtonElement[] = [];
  const panoramaToButton = new Map<string, HTMLButtonElement>();
  const panoramaToRoomEntry = new Map<string, string>();

  for (const floor of tour.floors) {
    const group = document.createElement('section');
    group.className = 'location-group';
    group.setAttribute('aria-labelledby', `floor-${floor.id}`);

    const title = document.createElement('h3');
    title.id = `floor-${floor.id}`;
    title.textContent = floor.name;
    group.append(title);

    const list = document.createElement('ul');
    for (const room of floor.rooms) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'location-link';
      button.dataset.panoramaId = room.entryPanoramaId;
      button.textContent = room.name;
      button.setAttribute('aria-label', `Abrir ${room.name}, ${floor.name}`);
      button.addEventListener('click', () => onNavigate(room.entryPanoramaId));
      item.append(button);
      list.append(item);
      buttons.push(button);
      panoramaToButton.set(room.entryPanoramaId, button);
      for (const panorama of room.panoramas) {
        panoramaToRoomEntry.set(panorama.id, room.entryPanoramaId);
      }
    }
    group.append(list);
    container.append(group);
  }

  // Las flechas, Inicio y Fin permiten recorrer el menú sin abandonar el teclado.
  function handleKeyboard(event: KeyboardEvent): void {
    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (currentIndex < 0) return;

    let nextIndex: number | undefined;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % buttons.length;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = buttons.length - 1;
    }

    if (nextIndex !== undefined) {
      event.preventDefault();
      buttons[nextIndex].focus();
    }
  }

  container.addEventListener('keydown', handleKeyboard);

  return {
    setActivePanorama: (panoramaId) => {
      const entryId = panoramaToRoomEntry.get(panoramaId);
      for (const button of buttons) {
        const isActive = button === panoramaToButton.get(entryId ?? '');
        button.classList.toggle('is-active', isActive);
        if (isActive) button.setAttribute('aria-current', 'location');
        else button.removeAttribute('aria-current');
      }
    },
    destroy: () => container.removeEventListener('keydown', handleKeyboard),
  };
}
