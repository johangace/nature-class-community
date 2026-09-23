const PRIVATE_PREFIXES = [
  "nature-class:run-progress:v3:",
  "nature-class:run-progress:v2:",
  "nature-class:journey-progress:v1:",
  "nature-class:completion-queue:v1:",
  "nature-class-run-",
  "nature-class-held-",
] as const;

const PRIVATE_EXACT_KEYS = new Set(["nature-class-pending-completions"]);

export function isPrivateLocalStateKey(key: string): boolean {
  return (
    PRIVATE_EXACT_KEYS.has(key) ||
    PRIVATE_PREFIXES.some((prefix) => key.startsWith(prefix))
  );
}
