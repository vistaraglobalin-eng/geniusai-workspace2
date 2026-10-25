import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// Tokens for connected apps are encrypted (AES-256-GCM) before they reach the database.
// The key is derived from INTEGRATIONS_SECRET if set, else from the Supabase service key,
// so it never sits in the database next to the data it protects.
function key(): Buffer {
  const material = process.env.INTEGRATIONS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!material) throw new Error("no_key");
  return Buffer.from(hkdfSync("sha256", material, "geniusai-integrations", "token-encryption-v1", 32));
}

export function seal(plain: string): string {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), body.toString("base64url")].join(".");
}

export function open(sealed: string): string | null {
  try {
    const [v, iv, tag, body] = sealed.split(".");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}
