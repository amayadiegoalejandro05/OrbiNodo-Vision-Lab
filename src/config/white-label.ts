import { getWhiteLabelConfiguration } from '../../client-config/white-label';
import type { ClientProfile } from '../../client-config/types';
export function applyWhiteLabel(profileId: string, productName: string): void {
  const config = getWhiteLabelConfiguration(profileId);
  for (const [name, value] of Object.entries(config.theme)) {
    document.documentElement.style.setProperty('--brand-' + name, value);
  }
  document.documentElement.dataset.clientProfile = profileId;
  for (const selector of ['.login-card', '.brand-heading']) {
    const host = document.querySelector<HTMLElement>(selector);
    if (!host) continue;
    host.querySelector('.client-brand')?.remove();
    const brand = document.createElement('div');
    brand.className = 'client-brand';
    brand.setAttribute('aria-label', config.assets.logoAlt);
    if (config.assets.logoUrl) {
      const image = document.createElement('img');
      image.className = 'client-brand-logo';
      image.src = config.assets.logoUrl;
      image.alt = config.assets.logoAlt;
      brand.append(image);
    } else {
      const mark = document.createElement('span');
      mark.className = 'client-brand-fallback';
      mark.textContent = config.assets.logoFallback;
      brand.append(mark);
    }
    const name = document.createElement('span');
    name.className = 'client-product-name';
    name.textContent = productName;
    brand.append(name);
    host.prepend(brand);
  }
  if (config.assets.faviconUrl) {
    let icon = document.querySelector<HTMLLinkElement>('link[rel=icon]');
    if (!icon) {
      icon = document.createElement('link');
      icon.rel = 'icon';
      document.head.append(icon);
    }
    icon.href = config.assets.faviconUrl;
  }
}

export function applyClientBranding(profile: ClientProfile): void {
  applyWhiteLabel(profile.id, profile.branding.productName);
  document.title = profile.branding.browserTitle;

  const textByClientField: Record<string, string> = {
    'login-eyebrow': profile.branding.loginEyebrow,
    'login-title': profile.branding.loginTitle,
    'login-description': profile.branding.loginDescription,
    'login-action': profile.branding.loginAction,
    'login-notice': profile.branding.loginNotice,
    'navigation-eyebrow': profile.branding.navigationEyebrow,
    'tour-title': profile.tour.title,
    footer: profile.branding.footer,
  };

  for (const [field, text] of Object.entries(textByClientField)) {
    for (const element of document.querySelectorAll<HTMLElement>(
      '[data-client="' + field + '"]',
    )) {
      element.textContent = text;
    }
  }
}
