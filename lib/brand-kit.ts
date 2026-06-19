// Brand Kit validation helpers and constants.
// Types live in `@/types/brand-kit`.

// ─── Validation helpers ───────────────────────────────────────────────────────

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const VALID_TONES = new Set<string>([
  'professional', 'friendly', 'authoritative', 'playful',
  'inspirational', 'educational', 'casual', 'formal',
]);
const VALID_COMPANY_SIZES = new Set<string>(['1-10', '11-50', '51-200', '201-500', '500+']);
const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/gif',
]);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MAX_ARRAY_ITEMS = 10;

export function validateBrandKitUpdate(input: Record<string, unknown>): string | null {
  const {
    name, tone, primary_color, secondary_color, accent_color,
    website_url, social_urls, customer_locations, uses_emojis,
    company_size, differentiators, challenges, competitors,
  } = input;

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return 'name must be a non-empty string';
    if (name.length > 100) return 'name must be 100 characters or fewer';
  }
  if (tone !== undefined) {
    if (!Array.isArray(tone)) return 'tone must be an array';
    for (const t of tone) {
      if (!VALID_TONES.has(t)) return `Invalid tone value: ${t}`;
    }
  }
  for (const [key, val] of [
    ['primary_color', primary_color],
    ['secondary_color', secondary_color],
    ['accent_color', accent_color],
  ] as const) {
    if (val !== undefined && val !== null) {
      if (typeof val !== 'string' || !HEX_COLOR.test(val)) {
        return `${key} must be a valid hex color (e.g. #FF0000)`;
      }
    }
  }
  if (website_url !== undefined && website_url !== null) {
    if (typeof website_url !== 'string') return 'website_url must be a string';
    try { new URL(website_url); } catch { return 'website_url must be a valid URL'; }
  }
  const { logo_url } = input;
  if (logo_url !== undefined && logo_url !== null) {
    if (typeof logo_url !== 'string') return 'logo_url must be a string';
    try { new URL(logo_url); } catch { return 'logo_url must be a valid URL'; }
  }
  if (social_urls !== undefined && social_urls !== null) {
    if (typeof social_urls !== 'object' || Array.isArray(social_urls)) return 'social_urls must be an object';
    for (const [, v] of Object.entries(social_urls as Record<string, unknown>)) {
      if (v !== undefined && typeof v !== 'string') return 'social_urls values must be strings';
    }
  }
  if (uses_emojis !== undefined && typeof uses_emojis !== 'boolean') {
    return 'uses_emojis must be a boolean';
  }
  if (company_size !== undefined && company_size !== null) {
    if (!VALID_COMPANY_SIZES.has(company_size as string)) {
      return `company_size must be one of: ${[...VALID_COMPANY_SIZES].join(', ')}`;
    }
  }
  for (const [key, arr] of [
    ['customer_locations', customer_locations],
    ['differentiators', differentiators],
    ['challenges', challenges],
    ['competitors', competitors],
  ] as const) {
    if (arr !== undefined) {
      if (!Array.isArray(arr)) return `${key} must be an array`;
      if (arr.length > MAX_ARRAY_ITEMS) return `${key} must have at most ${MAX_ARRAY_ITEMS} items`;
      for (const item of arr) {
        if (typeof item !== 'string') return `${key} items must be strings`;
      }
    }
  }
  return null;
}

export function validateAssetUpload(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return `Unsupported file type: ${file.type}. Allowed: PNG, JPEG, WEBP, SVG, GIF`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File too large (max 5 MB)`;
  }
  return null;
}

export const STORAGE_BUCKET = 'kefy-brand-assets';
