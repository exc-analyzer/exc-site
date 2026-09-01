interface SupabaseErrorLike {
  message?: string;
  code?: string;
  details?: string;
}
export function friendlyDbError(error: SupabaseErrorLike | null | undefined): string | null {
  if (!error) return null;
  const raw = error.message ?? '';
  if (/limit reached|comments open/i.test(raw)) {
    return raw;
  }
  switch (error.code) {
    case '23505':
      return 'You have already done this.';
    case '23503':
      return 'That failed: the record it depends on is missing.';
    case '23514':
      return 'That value was rejected. Check its length and format.';
    case '42501':
      return 'You are not allowed to do that. Try signing in.';
    case 'PGRST301':
      return 'Your session is no longer valid. Sign in again.';
  }
  if (/row-level security/i.test(raw)) {
    return 'You are not allowed to do that. Try signing in.';
  }
  if (/duplicate key/i.test(raw)) {
    return 'You have already done this.';
  }
  if (/violates check constraint/i.test(raw)) {
    return 'That value was rejected. Check its length and format.';
  }
  console.warn('Database error:', raw, error.code ?? '');
  return 'That did not go through. Try again in a moment.';
}
