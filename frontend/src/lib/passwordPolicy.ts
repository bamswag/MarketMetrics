export const PASSWORD_POLICY_MESSAGE =
  'Choose a password with at least 8 characters, including one number and one special character.'

const DIGIT_PATTERN = /\d/
const SPECIAL_CHARACTER_PATTERN = /[^A-Za-z0-9\s]/

export function isPasswordPolicyValid(password: string): boolean {
  return (
    password.length >= 8 &&
    DIGIT_PATTERN.test(password) &&
    SPECIAL_CHARACTER_PATTERN.test(password)
  )
}
