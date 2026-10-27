// Form feedback only. Supabase must also enforce its server-side password policy
// and rate limits: its public Auth endpoint can be called without this form.
export function emailError(email: string) {
  const address = email.trim();
  if (!address || address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
    return 'Enter a valid email address.';
  return null;
}
export function newPasswordError(password: string, confirmation: string) {
  if (Array.from(password).length < 12) return 'Use at least 12 characters for your password.';
  if (Array.from(password).length > 128) return 'Use no more than 128 characters for your password.';
  if (!password.trim()) return 'Use a password with more than spaces.';
  if (password !== confirmation) return 'Passwords do not match. Enter the same password in both fields.';
  return null;
}
export function credentialsError(email: string, password: string, register: boolean, confirmation: string) {
  const invalidEmail = emailError(email);
  if (invalidEmail) return invalidEmail;
  if (!password) return 'Enter your password.';
  // Do not trim, normalize, or apply new signup rules to existing passwords.
  if (register) return newPasswordError(password, confirmation);
  return null;
}

// Only these local destinations are accepted from authentication links.
export function authDestination(next: string | null) {
  return next === '/auth/reset-password' ? next : '/';
}
