/**
 * Redaction by value, not only by key.
 *
 * Key-name matching catches `password: "hunter2"`. It does not catch a Stripe
 * key inside an error message, a bearer token in a URL, or a private key
 * pasted into a note. Once stories are persisted and read back by agents, a
 * leaked secret is durable and retrievable, so the value itself has to be
 * recognised too.
 *
 * Defense in depth, not a guarantee: these are recognisable formats and
 * suspicious positions. A secret that looks like an ordinary word passes.
 * The balance leans toward keeping records readable — a viewer full of
 * `[redacted]` is no viewer — with a strict mode for the other trade.
 */
import type { JsonValue } from "./normalize";

/** Marker written in place of a redacted value or span */
export const REDACTED = "[redacted]";

/** How hard to look inside values. `off` leaves key matching only. */
export type RedactionStrictness = "off" | "balanced" | "strict";

/**
 * Formats that are secrets by construction. Each pattern replaces only the
 * secret span, so the text around it — the sentence, the URL's host — stays.
 */
type Rule = { pattern: RegExp; replacement: string };
type RuleGroup = { anchor: RegExp; rules: Rule[] };

/**
 * Grouped by what a string must contain for any rule in the group to match,
 * so one cheap anchor test per group decides whether its rules run. The
 * ordinary string — a sentence, a path, a UUID, a user agent — costs three
 * scans and no replacements.
 */
const RULE_GROUPS: RuleGroup[] = [
  {
    // Vendor key formats
    anchor: /sk[-_]|rk_|gh[opusr]_|github_pat_|glpat-|npm_|xox[abprs]-|AIza|SG\.|AKIA|ASIA|eyJ|PRIVATE KEY/,
    rules: [
      // Stripe secret and restricted keys
      { pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{8,}\b/g, replacement: REDACTED },
      // OpenAI, Anthropic and similar `sk-` keys
      { pattern: /\bsk-(?:[A-Za-z0-9]+-)*[A-Za-z0-9_-]{16,}/g, replacement: REDACTED },
      // GitHub tokens, classic and fine-grained
      { pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}\b/g, replacement: REDACTED },
      { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, replacement: REDACTED },
      // GitLab, npm, Slack, Google, SendGrid, AWS access key ids
      { pattern: /\bglpat-[A-Za-z0-9_-]{16,}\b/g, replacement: REDACTED },
      { pattern: /\bnpm_[A-Za-z0-9]{30,}\b/g, replacement: REDACTED },
      { pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, replacement: REDACTED },
      { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g, replacement: REDACTED },
      { pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g, replacement: REDACTED },
      { pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, replacement: REDACTED },
      // JSON Web Tokens
      { pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, replacement: REDACTED },
      // PEM private keys, whole block
      { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, replacement: REDACTED },
    ],
  },
  {
    // Authorization header values: keep the scheme, drop the credential
    anchor: /\b(?:Bearer|Basic|Token|Digest) /,
    rules: [{ pattern: /\b(Bearer|Basic|Token|Digest)\s+[A-Za-z0-9._~+/=-]{12,}/g, replacement: `$1 ${REDACTED}` }],
  },
  {
    // URLs: a password in the userinfo, a secret in the query string
    anchor: /:\/\/|[?&]/,
    rules: [
      { pattern: /(:\/\/[^\s/:@]+:)[^\s@/]+(@)/g, replacement: `$1${REDACTED}$2` },
      {
        pattern: /([?&](?:token|access_token|refresh_token|id_token|api_key|apikey|api-key|key|secret|client_secret|password|passwd|pwd|signature|sig|auth|authorization)=)[^&\s#]+/gi,
        replacement: `$1${REDACTED}`,
      },
    ],
  },
];

/**
 * Key names whose string values are secrets whenever they are long enough to
 * be one. Substring match on the reduced key, so `dbPassword`, `x-api-key`,
 * `STRIPE_SECRET_KEY` and `clientCredential` all count.
 */
const STRONG_KEY_HINT =
  /password|passwd|passphrase|secret|apikey|privatekey|credential|authorization|accesskey|sessionid|cookie|refreshtoken|accesstoken|idtoken|clientkey|signingkey|encryptionkey|masterkey|servicekey/;
/** Weaker hints: only redact when the value also looks random */
const WEAK_KEY_HINT = /token|key|auth|bearer|cert|pwd/;

type KeyHint = "strong" | "weak" | "none";
/** Property names repeat across every note of every story; classify each once */
const keyHints = new Map<string, KeyHint>();
const KEY_HINT_CACHE_LIMIT = 4096;

function hintFor(key: string): KeyHint {
  const cached = keyHints.get(key);
  if (cached !== undefined) return cached;
  const reduced = normalizeKeyForMatching(key);
  const hint: KeyHint = STRONG_KEY_HINT.test(reduced) ? "strong" : WEAK_KEY_HINT.test(reduced) ? "weak" : "none";
  if (keyHints.size >= KEY_HINT_CACHE_LIMIT) keyHints.clear();
  keyHints.set(key, hint);
  return hint;
}

const MIN_STRONG_LENGTH = 4;
const MIN_ENTROPY_LENGTH = 16;
const MIN_ENTROPY_BITS = 3;
const MIN_STRICT_LENGTH = 32;

/** Reduce a property name to letters and digits so casing and separators do not matter */
export function normalizeKeyForMatching(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
}

/** Shannon entropy in bits per character */
function entropyOf(text: string): number {
  const counts = new Map<string, number>();
  for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / text.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** A string that reads as random: long enough, no whitespace, mixed characters */
function looksRandom(value: string, minimumLength: number): boolean {
  if (value.length < minimumLength || /\s/.test(value)) return false;
  // Hex is a hash or an id far more often than a secret; digits alone are a number
  if (/^[0-9a-f-]+$/i.test(value) || /^[0-9.-]+$/.test(value)) return false;
  return entropyOf(value) >= MIN_ENTROPY_BITS;
}

/**
 * Does this property hold a secret, judging by its name and what the value
 * looks like? Only strings — a `tokenCount: 12` or `tokens: ["a", "b"]` is data.
 */
export function keyLooksSecret(key: string, value: unknown): boolean {
  if (typeof value !== "string") return false;
  const hint = hintFor(key);
  if (hint === "strong") return value.length >= MIN_STRONG_LENGTH;
  if (hint === "weak") return looksRandom(value, MIN_ENTROPY_LENGTH);
  return false;
}

/**
 * Replace every recognisable secret inside a string, keeping the rest.
 * In strict mode any long random-looking run goes too.
 */
/** Any group's anchor, as one scan: the ordinary string pays for this test and nothing else */
const ANY_ANCHOR = new RegExp(RULE_GROUPS.map((group) => group.anchor.source).join("|"));

export function redactString(value: string, strictness: RedactionStrictness = "balanced"): string {
  if (strictness === "off" || value.length < 8) return value;
  let result = value;
  if (!ANY_ANCHOR.test(value)) return strictness === "strict" ? redactRandomRuns(value) : value;
  for (const group of RULE_GROUPS) {
    if (!group.anchor.test(result)) continue;
    for (const { pattern, replacement } of group.rules) {
      pattern.lastIndex = 0;
      result = result.replace(pattern, replacement);
    }
  }
  return strictness === "strict" ? redactRandomRuns(result) : result;
}

/** Strict mode: any long run that reads as random goes, hashes and ids excepted */
function redactRandomRuns(text: string): string {
  return text.replace(/(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{32,}={0,2}(?![A-Za-z0-9+/=_-])/g, (run) =>
    looksRandom(run, MIN_STRICT_LENGTH) && characterClasses(run) >= 3 ? REDACTED : run
  );
}

function characterClasses(text: string): number {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((test) => test.test(text)).length;
}

export type RedactJsonOptions = {
  /** Property names redacted whatever their value; reduced like the keys they match */
  redactKeys?: Set<string>;
  strictness?: RedactionStrictness;
};

/**
 * Redact an already-normalized value: exact keys, secret-shaped keys, and
 * secret-shaped strings. This is the pass at the storage boundary, so a story
 * fed to a store by hand — or normalized with redaction off — is still covered
 * before it becomes durable. Returns a new value; the input is untouched.
 */
export function redactJson(value: JsonValue, options: RedactJsonOptions = {}): JsonValue {
  const strictness = options.strictness ?? "balanced";
  const keys = options.redactKeys;
  const walk = (node: JsonValue): JsonValue => {
    if (typeof node === "string") return redactString(node, strictness);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      const out: { [key: string]: JsonValue } = {};
      for (const [key, child] of Object.entries(node)) {
        if (keys?.has(normalizeKeyForMatching(key)) || (strictness !== "off" && keyLooksSecret(key, child))) {
          out[key] = REDACTED;
        } else {
          out[key] = walk(child);
        }
      }
      return out;
    }
    return node;
  };
  return walk(value);
}

export type RedactionFinding = {
  /** Where, as `$.a.b[0]` */
  path: string;
  /** Why it would be redacted */
  reason: "key" | "key-hint" | "pattern" | "entropy";
  /** The first characters, so a person can tell what it was without seeing it */
  preview: string;
};

/**
 * Report what redaction *would* do to a normalized value, changing nothing.
 * Run it over a corpus of real stories to see coverage rather than trust it —
 * and to find the false positives before they eat a record.
 */
export function auditRedaction(value: JsonValue, options: RedactJsonOptions = {}): RedactionFinding[] {
  const strictness = options.strictness ?? "balanced";
  const keys = options.redactKeys;
  const findings: RedactionFinding[] = [];
  const preview = (text: string) => (text.length <= 4 ? "…" : `${text.slice(0, 4)}…`);
  const walk = (node: JsonValue, path: string): void => {
    if (typeof node === "string") {
      if (node === REDACTED) return;
      const redacted = redactString(node, strictness);
      if (redacted !== node) {
        const strict = redactString(node, "balanced") === node;
        findings.push({ path, reason: strict ? "entropy" : "pattern", preview: preview(node) });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, index) => walk(child, `${path}[${index}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        const childPath = `${path}.${key}`;
        if (child === REDACTED) continue;
        if (keys?.has(normalizeKeyForMatching(key))) {
          findings.push({ path: childPath, reason: "key", preview: typeof child === "string" ? preview(child) : "…" });
        } else if (strictness !== "off" && keyLooksSecret(key, child)) {
          findings.push({ path: childPath, reason: "key-hint", preview: preview(child as string) });
        } else {
          walk(child, childPath);
        }
      }
    }
  };
  walk(value, "$");
  return findings;
}
