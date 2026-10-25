// Form feedback only. Supabase must also enforce its server-side password policy
// and rate limits: its public Auth endpoint can be called without this form.
export function credentialsError(email: string, password: string, register: boolean, confirmation: string) {
  const address = email.trim();
  if (!address || address.length > 254 || !/^[^\s@]+@[^\s@]+$/.test(address))
    return 'Enter a valid email address.';
  if (!password) return 'Enter your password.';
  // Do not trim, normalize, or apply new signup rules to existing passwords.
  if (register && Array.from(password).length < 8)
    return 'Use at least 8 characters for your password.';
  if (register && password !== confirmation)
    return 'Passwords do not match. Enter the same password in both fields.';
  return null;
}
