/**
 * Password hashing utilities (bcrypt).
 *
 * - hashPassword(plain): returns bcrypt hash, cost 12
 * - verifyPassword(plain, hash): constant-time compare
 * - generateTemporaryPassword(): secure random, easy-to-type
 */

import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'

const COST = 12

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

/**
 * Generates a random temporary password that is reasonably easy to type
 * but still cryptographically secure. Format: XXXX-XXXX-XXXX (alphanumeric).
 */
export function generateTemporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no easily-confused chars
  const bytes = randomBytes(12)
  let out = ''
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i] % alphabet.length]
    if (i === 3 || i === 7) out += '-'
  }
  return out
}

/**
 * Validates password strength.
 * Min 8 chars, at least one uppercase, one lowercase, one digit.
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters long.'
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.'
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.'
  if (!/[0-9]/.test(password)) return 'Password must contain at least one digit.'
  return null
}
