import type { TourConfig } from '../domain/tour.types';

// Los ángulos son provisionales: se ajustarán con las fotos reales del inmueble.
export const demoTour: TourConfig = {
  title: 'Recorrido virtual de la vivienda',
  startPanoramaId: 'parqueadero-01',
  floors: [
    {
      id: 'sotano',
      name: 'Sótano',
      rooms: [
        {
          id: 'sotano',
          name: 'Sótano',
          entryPanoramaId: 'sotano-01',
          panoramas: [
            {
              id: 'sotano-01',
              name: 'Punto 1',
              image: 'panoramas/demo/sotano-demo-01.png',
              links: [
                { targetId: 'parqueadero-01', label: 'Subir al parqueadero', yaw: -144.6, pitch: -26.3 },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'primer-piso',
      name: 'Primer piso',
      rooms: [
        {
          id: 'parqueadero',
          name: 'Parqueadero',
          entryPanoramaId: 'parqueadero-01',
          panoramas: [
            {
              id: 'parqueadero-01',
              name: 'Punto 1',
              image: 'panoramas/demo/parqueadero-demo-01.png',
              links: [
                { targetId: 'pasillo-01', label: 'Ir al pasillo', yaw: 0, pitch: -12 },
                { targetId: 'sotano-01', label: 'Bajar al sotano', yaw: -90, pitch: -12 },
              ],
            },
          ],
        },
        {
          id: 'pasillo',
          name: 'Pasillo',
          entryPanoramaId: 'pasillo-01',
          panoramas: [
            {
              id: 'pasillo-01',
              name: 'Punto 1',
              image: 'panoramas/demo/pasillo-demo-01.png',
              links: [
                { targetId: 'parqueadero-01', label: 'Volver al parqueadero', yaw: 180, pitch: -12 },
                { targetId: 'cocina-01', label: 'Ir a la cocina', yaw: 0, pitch: -12 },
                { targetId: 'escalera-inferior-01', label: 'Ir a las escaleras', yaw: 90, pitch: -12 },
              ],
            },
          ],
        },
        {
          id: 'cocina',
          name: 'Cocina',
          entryPanoramaId: 'cocina-01',
          panoramas: [
            {
              id: 'cocina-01',
              name: 'Punto 1',
              image: 'panoramas/demo/cocina-demo-01.png',
              links: [
                { targetId: 'pasillo-01', label: 'Volver al pasillo', yaw: -18, pitch: -12 },
                { targetId: 'jardin-01', label: 'Salir al jardín', yaw: 143.8, pitch: -23.5 },
              ],
            },
          ],
        },
        {
          id: 'escalera-inferior',
          name: 'Escalera inferior',
          entryPanoramaId: 'escalera-inferior-01',
          panoramas: [
            {
              id: 'escalera-inferior-01',
              name: 'Base',
              image: 'panoramas/demo/escalera-inferior-demo-01.png',
              links: [
                { targetId: 'pasillo-01', label: 'Volver al pasillo', yaw: -140, pitch: -12 },
                { targetId: 'escalera-superior-01', label: 'Subir al segundo piso', yaw: 0, pitch: 8 },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'segundo-piso',
      name: 'Segundo piso',
      rooms: [
        {
          id: 'escalera-superior',
          name: 'Escalera superior',
          entryPanoramaId: 'escalera-superior-01',
          panoramas: [
            {
              id: 'escalera-superior-01',
              name: 'Descanso',
              image: 'panoramas/demo/escalera-superior-demo-01.png',
              links: [
                { targetId: 'escalera-inferior-01', label: 'Bajar al primer piso', yaw: 0, pitch: -18 },
                { targetId: 'cuarto-derecho-01', label: 'Derecha: Cuarto 1', yaw: 125, pitch: -10 },
                { targetId: 'cuarto-izquierdo-01', label: 'Izquierda: Cuarto 2', yaw: -145, pitch: -10 },
              ],
            },
          ],
        },
        {
          id: 'cuarto-derecho',
          name: 'Cuarto 1 (derecha)',
          entryPanoramaId: 'cuarto-derecho-01',
          panoramas: [
            {
              id: 'cuarto-derecho-01',
              name: 'Punto 1',
              image: 'panoramas/demo/cuarto-derecho-demo-01.png',
              links: [
                { targetId: 'escalera-superior-01', label: 'Volver al descanso', yaw: 170, pitch: -10 },
              ],
            },
          ],
        },
        {
          id: 'cuarto-izquierdo',
          name: 'Cuarto 2 (izquierda)',
          entryPanoramaId: 'cuarto-izquierdo-01',
          panoramas: [
            {
              id: 'cuarto-izquierdo-01',
              name: 'Punto 1',
              image: 'panoramas/demo/cuarto-izquierdo-demo-01.png',
              links: [
                { targetId: 'escalera-superior-01', label: 'Volver al descanso', yaw: -145, pitch: -10 },
                { targetId: 'estudio-01', label: 'Continuar al estudio', yaw: 135, pitch: -10 },
              ],
            },
          ],
        },
        {
          id: 'estudio',
          name: 'Estudio',
          entryPanoramaId: 'estudio-01',
          panoramas: [
            {
              id: 'estudio-01',
              name: 'Punto 1',
              image: 'panoramas/demo/estudio-demo-01.png',
              links: [
                { targetId: 'cuarto-izquierdo-01', label: 'Volver al Cuarto 2', yaw: -150, pitch: -10 },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'exterior',
      name: 'Exterior',
      rooms: [
        {
          id: 'jardin',
          name: 'Jardín',
          entryPanoramaId: 'jardin-01',
          panoramas:[
            {
              id: 'jardin-01',
              name: 'Punto 1',
              image: 'panoramas/demo/jardin-demo-01.png',
              links:[
                {
                  targetId: 'cocina-01',
                  label: 'entrar a la cocina',
                  yaw: -120,
                  pitch: -10
                }
              ]
            }
          ]
        }
      ]
    }
  ],
};
