import { getClientProfile } from '../../client-config/client-profiles';

const selectedProfile = import.meta.env.VITE_ORBINODO_CLIENT_PROFILE ?? 'orbinodo-demo';

export const activeClientProfile = getClientProfile(selectedProfile);
