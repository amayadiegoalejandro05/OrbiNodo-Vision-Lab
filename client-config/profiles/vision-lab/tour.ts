import type { TourConfig } from '../../../src/domain/tour.types';

// The inherited asset is a technical placeholder until Vision Lab has an approved panorama.
export const visionLabTour: TourConfig = {
  title: 'OrbiNodo Vision Lab - Robot simulation',
  startPanoramaId: 'vision-lab-placeholder-01',
  floors: [{
    id: 'vision-lab',
    name: 'Vision Lab',
    rooms: [{
      id: 'robot-simulation',
      name: 'Robot Simulation',
      entryPanoramaId: 'vision-lab-placeholder-01',
      panoramas: [{
        id: 'vision-lab-placeholder-01',
        name: 'Technical placeholder',
        image: 'panoramas/demo/parqueadero-demo-01.png',
        links: [],
      }],
    }],
  }],
};
