export const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidUsernameFormat(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

export function isValidBio(bio: string): boolean {
  return bio.length <= 150;
}

export function isValidNote(note: string): boolean {
  return note.length <= 280;
}

/** Escapes LIKE/ILIKE wildcard characters so a raw username can be matched literally. */
export function escapeForIlike(value: string): string {
  return value.replace(/[%_]/g, (c) => `\\${c}`);
}
