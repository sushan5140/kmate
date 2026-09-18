export const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
export const DEMO_USERNAME = "preview";

export function isDemoUserId(userId: string | null | undefined) {
  return userId === DEMO_USER_ID;
}
