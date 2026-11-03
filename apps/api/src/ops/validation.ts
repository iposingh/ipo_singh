let failures = 0;

export function recordValidationFailure(): void {
  failures += 1;
}

export function validationFailureCount(): number {
  return failures;
}
