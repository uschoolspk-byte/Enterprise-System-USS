import logoAsset from '../../logo.PNG?url';

/** Default school logo (bundled from project root logo.PNG). */
export const DEFAULT_LOGO_URL = logoAsset;

export function resolveLogoUrl(logoUrl?: string): string {
  const trimmed = logoUrl?.trim();
  return trimmed || DEFAULT_LOGO_URL;
}
