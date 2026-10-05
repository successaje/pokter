/**
 * Whether this wallet has self-marked itself registered for Set and Earn.
 *
 * Shared because the passport and the account page both read it, and a
 * storage key spelled twice is a key that eventually differs by a character
 * and silently reports two different answers for one wallet.
 *
 * Self-marked and device-local by design: Pokter cannot see a registration
 * made on BNB Chain's own form, and claiming to verify it would be a worse
 * lie than asking.
 */
const REGISTRATION_KEY = 'pokter.set-and-earn.registered.v1';
export const REGISTRATION_EVENT = 'pokter:set-and-earn-registration-changed';

export function registrationKey(wallet: string): string {
  return `${REGISTRATION_KEY}:${wallet.toLowerCase()}`;
}

export function subscribeToRegistration(listener: () => void): () => void {
  window.addEventListener('storage', listener);
  window.addEventListener(REGISTRATION_EVENT, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(REGISTRATION_EVENT, listener);
  };
}
