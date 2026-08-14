// El dominio describe el recorrido sin depender del visor ni del HTML.
export interface TourLink {
  targetId: string;
  label: string;
  yaw: number;
  pitch: number;
}

export interface TourPanorama {
  id: string;
  name: string;
  image: string;
  links: TourLink[];
}

export interface TourRoom {
  id: string;
  name: string;
  entryPanoramaId: string;
  panoramas: TourPanorama[];
}

export interface TourFloor {
  id: string;
  name: string;
  rooms: TourRoom[];
}

export interface TourConfig {
  title: string;
  startPanoramaId: string;
  floors: TourFloor[];
}

export interface PanoramaLocation {
  floorId: string;
  floorName: string;
  roomId: string;
  roomName: string;
  panoramaId: string;
  panoramaName: string;
}
