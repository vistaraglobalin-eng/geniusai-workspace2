// Checks a password against the Have I Been Pwned list of leaked passwords, privately:
// only the first 5 characters of the password's SHA-1 hash leave the device (k-anonymity),
// and the response is padded so its size reveals nothing. The password itself is never sent.

export async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** How many times the password appears in known leaks (0 = not found), or null if the check couldn't run. */
export async function leakCount(password: string, fetchImpl: typeof fetch = fetch): Promise<number | null> {
  try {
    const hash = await sha1Hex(password);
    const prefix = hash.slice(0, 5), suffix = hash.slice(5);
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" }, signal: AbortSignal.timeout(4000), cache: "no-store"
    });
    if (!res.ok) return null;
    for (const line of (await res.text()).split("\n")) {
      const [s, c] = line.trim().split(":");
      if (s === suffix) return Number(c) || 0;
    }
    return 0;
  } catch {
    return null; // offline or blocked: don't stop the person, Supabase still checks length
  }
}

export const leakedMessage = (n: number) =>
  `This password has appeared in data leaks${n > 1 ? ` ${n.toLocaleString("en-IN")} times` : ""}, so attackers try it first. Please choose a different one.`;
