import type { TourConfig } from '../domain/tour.types';

export interface TourMinimapApi {
  setActivePanorama: (panoramaId: string) => void;
  destroy: () => void;
}

// Este primer minimapa representa relaciones lógicas, no distancias ni posiciones
// arquitectónicas. Se genera desde TourConfig para no duplicar nodos manualmente.
export function createTourMinimap(
  container: HTMLElement,
  tour: TourConfig,
  onNavigate: (panoramaId: string) => void,
): TourMinimapApi {
  const buttons = new Map<string, HTMLButtonElement>();

  for (const floor of tour.floors) {
    const group = document.createElement('section');
    group.className = 'minimap-group';

    const title = document.createElement('h4');
    title.textContent = floor.name;
    group.append(title);

    const lane = document.createElement('div');
    lane.className = 'minimap-lane';
    for (const room of floor.rooms) {
      for (const panorama of room.panoramas) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'minimap-node';
        button.dataset.panoramaId = panorama.id;
        button.title = room.name + ' · ' + panorama.name;
        button.setAttribute(
          'aria-label',
          'Ir a ' + room.name + ', ' + floor.name + ', ' + panorama.name,
        );

        const dot = document.createElement('span');
        dot.className = 'minimap-dot';
        dot.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.className = 'minimap-label';
        label.textContent = room.name;
        button.append(dot, label);
        button.addEventListener('click', () => onNavigate(panorama.id));
        buttons.set(panorama.id, button);
        lane.append(button);
      }
    }
    group.append(lane);
    container.append(group);
  }

  return {
    setActivePanorama: (panoramaId) => {
      for (const [id, button] of buttons) {
        const isActive = id === panoramaId;
        button.classList.toggle('is-active', isActive);
        if (isActive) button.setAttribute('aria-current', 'location');
        else button.removeAttribute('aria-current');
      }
    },
    destroy: () => {
      buttons.clear();
      container.replaceChildren();
    },
  };
}
