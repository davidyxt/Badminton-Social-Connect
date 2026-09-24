// Mirrors the Supabase password policy in supabase/config.toml
// (minimum_password_length = 8, password_requirements = "lower_upper_letters_digits").
// Supabase enforces it on the server; this just gives earlier, friendlier feedback.

export const PASSWORD_HINT =
  "At least 8 characters, with upper and lower case letters and a number.";

const rules = [
  { test: (password) => password.length >= 8, message: "at least 8 characters" },
  { test: (password) => /[a-z]/.test(password), message: "a lowercase letter" },
  { test: (password) => /[A-Z]/.test(password), message: "an uppercase letter" },
  { test: (password) => /[0-9]/.test(password), message: "a number" },
];

export function getPasswordError(password) {
  const missing = rules
    .filter((rule) => !rule.test(password))
    .map((rule) => rule.message);

  if (missing.length === 0) return "";

  return `Password needs ${missing.join(", ")}.`;
}
