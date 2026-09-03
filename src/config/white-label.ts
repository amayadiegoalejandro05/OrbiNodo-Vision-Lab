import { getWhiteLabelConfiguration } from '../../client-config/white-label';
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
