import { orbinodoDemoProfile } from './profiles/orbinodo-demo/profile';
import type { ClientProfile } from './types';

const profiles: Record<string, ClientProfile> = {
  [orbinodoDemoProfile.id]: orbinodoDemoProfile,
};

export function getClientProfile(profileId: string): ClientProfile {
  const profile = profiles[profileId];
  if (!profile) {
    throw new Error('No existe la configuracion del cliente: ' + profileId);
  }
  return profile;
}

export function listClientProfileIds(): string[] {
  return Object.keys(profiles).sort();
}
