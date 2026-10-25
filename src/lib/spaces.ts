export type Space = { id: string; name: string; count?: number };
export const MAX_SPACES = 100;
export const SPACE_NAME_MAX = 60;
export const cleanSpaceName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, SPACE_NAME_MAX) : "");
/** Spaces need a one-time database update; until then the Files page works without them. */
export const spacesMissing = (message?: string) => !!message && /spaces|space_id|does not exist|schema cache/i.test(message);
