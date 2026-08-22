/**
 * Phone number normalization and utility functions for Vibe.
 * Ensures uniform E.164 formatting throughout registration, authentication, database storage, and contact searches.
 */

/**
 * Normalizes any phone number input into a consistent E.164 international format (+[country_code][national_number]).
 *
 * Handles formats like:
 * - 017XXXXXXXX (Bangladesh 11-digit mobile starting with 01 -> +88017XXXXXXXX)
 * - +88017XXXXXXXX -> +88017XXXXXXXX
 * - +1 (555) 234-5678 -> +15552345678
 * - 5552345678 (10-digit North America -> +15552345678)
 * - 15552345678 (11-digit starting with 1 -> +15552345678)
 * - 0088017... (00 international prefix -> +88017...)
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return '';
  const trimmed = rawPhone.trim();

  // Strip all non-digit and non-plus characters
  const cleaned = trimmed.replace(/[^\d+]/g, '');

  if (cleaned.startsWith('+')) {
    return '+' + cleaned.replace(/[^\d]/g, '');
  }

  if (cleaned.startsWith('00')) {
    return '+' + cleaned.slice(2);
  }

  const digits = cleaned.replace(/\D/g, '');

  // Bangladesh 11-digit mobile starting with 01 (e.g. 017..., 018..., 019...)
  if (digits.length === 11 && digits.startsWith('01')) {
    return `+880${digits.slice(1)}`;
  }

  // 10 digits standard (e.g. US/Canada)
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // 11 digits starting with 1 (US/Canada with country code 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Default fallback: prepend '+' to digits
  return `+${digits}`;
}

/**
 * Returns digits-only string of the normalized phone number.
 */
export function getPhoneDigits(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  return normalized.replace(/\D/g, '');
}

/**
 * Deterministic shadow email for Supabase Auth.
 * Uses the normalized phone digits to create a unique identifier for Supabase email auth.
 */
export function getPhoneAuthEmail(phone: string): string {
  const digits = getPhoneDigits(phone);
  return `phone_${digits}@vibe.chat`;
}

/**
 * Returns common search variations for a phone number to maximize search hit rate in contacts.
 */
export function getPhoneSearchVariations(phone: string): string[] {
  const normalized = normalizePhoneNumber(phone);
  const digits = phone.replace(/\D/g, '');
  const normDigits = normalized.replace(/\D/g, '');
  const variations = new Set<string>();

  if (normalized) variations.add(normalized);
  if (phone.trim()) variations.add(phone.trim());
  if (digits) variations.add(digits);
  if (normDigits) variations.add(normDigits);

  // If starts with +8801..., also include 01...
  if (normalized.startsWith('+8801')) {
    variations.add('0' + normalized.slice(4));
  }

  // If starts with +1..., also include 10 digits
  if (normalized.startsWith('+1') && normalized.length === 12) {
    variations.add(normalized.slice(2));
  }

  return Array.from(variations);
}
