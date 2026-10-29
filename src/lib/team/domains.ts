// "Join with your company email": domain rules shared by the API, pages and tests (pure module).

export const MAX_DOMAINS_PER_WORKSPACE = 3;

/** Free / public email providers: nobody can claim these for a workspace. */
export const PUBLIC_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.in", "yahoo.co.in", "ymail.com", "rocketmail.com", "outlook.com", "outlook.in",
  "hotmail.com", "hotmail.co.in", "live.com", "live.in", "msn.com", "icloud.com", "me.com", "mac.com", "aol.com", "protonmail.com",
  "proton.me", "pm.me", "zoho.com", "zohomail.in", "zohomail.com", "rediffmail.com", "rediff.com", "mail.com", "gmx.com", "gmx.net",
  "yandex.com", "yandex.ru", "tutanota.com", "fastmail.com", "hey.com", "inbox.com", "qq.com", "163.com", "126.com", "naver.com"
]);

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** "@VistaraGlobal.in ", "https://vistaraglobal.in/x" or "riya@vistaraglobal.in" → "vistaraglobal.in"; "" if invalid. */
export function cleanDomain(input: unknown): string {
  if (typeof input !== "string") return "";
  let s = input.trim().toLowerCase();
  if (s.includes("@")) s = s.slice(s.lastIndexOf("@") + 1);
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/\.$/, "");
  return s.length >= 3 && s.length <= 120 && DOMAIN_RE.test(s) ? s : "";
}

export const domainOf = (email: string | null | undefined) => cleanDomain(email ?? "");
export const isPublicDomain = (d: string) => PUBLIC_DOMAINS.has(d);

/** Why an admin can't claim a domain, or null if they can. Their own email must be on it. */
export function claimProblem(domain: string, adminEmail: string | null | undefined): string | null {
  if (!domain) return "Enter a domain like yourcompany.com.";
  if (isPublicDomain(domain)) return `${domain} is a public email provider, so it can't be used for a company workspace.`;
  if (domainOf(adminEmail) !== domain) return `To claim ${domain}, sign in with your own @${domain} email first.`;
  return null;
}
