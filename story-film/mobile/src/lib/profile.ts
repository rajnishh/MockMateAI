import type { ProfileField } from "./api";

// "Add your photo and username": what's left of the profile, in words.
export function profileTodo(missing: ProfileField[] | undefined): string {
  const words = (missing ?? []).map((m) => (m === "handle" ? "username" : m));
  if (!words.length) return "";
  return `Add your ${words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}` : words[0]}`;
}
