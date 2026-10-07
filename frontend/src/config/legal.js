// Version labels recorded when a player accepts the terms of use and the
// privacy notice (BL-007). Placeholders until the team chooses the labels and
// publishes the documents (items-to-confirm 11). Change both here when a new
// version is published.
export const TERMS_VERSION = "2026-10";
export const PRIVACY_VERSION = "2026-10";

export const MINIMUM_AGE = 18;

// True when someone born on dateOfBirth ("YYYY-MM-DD") is 18 or over today.
// The database makes the final decision using the player's state; this is
// only so the form can say so before submitting.
export function isOldEnough(dateOfBirth) {
  if (!dateOfBirth) return false;
  const [y, m, d] = dateOfBirth.split("-").map(Number);
  const today = new Date();
  const eighteenth = new Date(y + MINIMUM_AGE, m - 1, d);
  return eighteenth <= today;
}
