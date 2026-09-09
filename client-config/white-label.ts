
const configurations: Record<string, WhiteLabelConfiguration> = {
  'orbinodo-demo': {
    assets: {
      logoAlt: 'OrbiNodo',
      logoFallback: 'O',
    },
    theme: {
      background: '#07111f',
      surface: '#0d1a2a',
      text: '#f5f7fb',
      textMuted: '#aebed0',
      primary: '#75d9c5',
      primaryContrast: '#08271f',
      accent: '#f7c969',
      accentContrast: '#3d2a00',
      highlight: '#42d9e8',
      danger: '#ff7d8a',
    },
  },
  'vision-lab': { assets: { logoAlt: 'OrbiNodo Vision Lab', logoFallback: 'V' }, theme: { background: '#07111f', surface: '#0d1a2a', text: '#f5f7fb', textMuted: '#aebed0', primary: '#75d9c5', primaryContrast: '#08271f', accent: '#f7c969', accentContrast: '#3d2a00', highlight: '#42d9e8', danger: '#ff7d8a' } },
};

export function getWhiteLabelConfiguration(profileId: string): WhiteLabelConfiguration {
  const configuration = configurations[profileId];
  if (!configuration) {
    throw new Error('No existe configuracion visual para el perfil: ' + profileId);
  }
  return configuration;
}
export interface WhiteLabelAssets {
  logoUrl?: string;
  faviconUrl?: string;
  logoAlt: string;
  logoFallback: string;
}
export interface WhiteLabelTheme { [name: string]: string; }
export interface WhiteLabelConfiguration { assets: WhiteLabelAssets; theme: WhiteLabelTheme; }
