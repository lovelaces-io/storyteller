import { describe, expect, it } from "vitest";
import { normalizeError, normalizeValue, REDACTED } from "../src/normalize";
import { auditRedaction, keyLooksSecret, redactJson, redactString } from "../src/redaction";
import { memoryStore } from "../src/store/memoryStore";
import { toStoredStory, type StoredStory } from "../src/store/storyStore";

/* Secrets by value: none of these sit under a key that gives them away.
   Assembled at run time from pieces, so no complete token exists in this
   file — the repository's push protection scans for exactly these formats,
   and a test corpus should not look like a leak. */
const piece = (...parts: string[]) => parts.join("");
const SECRETS: Record<string, string> = {
  stripeLive: piece("sk_live", "_4eC39HqLyjWDarjtT1zdp7dc"),
  stripeRestricted: piece("rk_test", "_51H8mZ2K3jL4mN5oP6qR7sT8u"),
  openai: piece("sk-proj", "-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z"),
  anthropic: piece("sk-ant", "-api03-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb3dEf6hIj9kLm2n"),
  githubClassic: piece("ghp", "_Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb3d"),
  githubFine: piece("github_pat", "_11ABCDEFG0Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z"),
  gitlab: piece("glpat", "-Ab3dEf6hIj9kLm2nOp5q"),
  npm: piece("npm", "_Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb3d"),
  slack: piece("xoxb", "-1234567890-abcdefghijklmnop"),
  google: piece("AIza", "SyAb3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zA"),
  sendgrid: piece("SG", ".Ab3dEf6hIj9kLm2nOp5q.Rs8tUv1wXy4zAb3dEf6hIj9k"),
  awsAccessKey: piece("AKIA", "IOSFODNN7EXAMPLE"),
  jwt: piece("eyJ", "hbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"),
  pem: piece("-----BEGIN RSA ", "PRIVATE KEY-----\nMIIEowIBAAKCAQEA0Z3VS5JJcds3xfn\n-----END RSA ", "PRIVATE KEY-----"),
};

/* Legitimate content that must survive in balanced mode. */
const LEGITIMATE: Record<string, string> = {
  uuid: "d061a841-a243-44d0-9a5b-463e5e6184ed",
  sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  gitSha: "2326090a1b2c3d4e5f60718293a4b5c6d7e8f901",
  isoDate: "2026-09-04T14:02:11.418Z",
  url: "https://api.example.com/v1/orders?page=2&sort=created_at",
  urlWithUser: "postgres://app@db.internal:5432/orders",
  email: "ada@example.com",
  phone: "+1 415 555 0134",
  path: "/Users/ada/projects/storyteller/packages/core/src/normalize.ts",
  semver: "0.3.1-beta.2+build.77",
  sentence: "The quick brown fox jumps over the lazy dog, twice, before lunch.",
  stack: "TypeError: Cannot read properties of undefined (reading 'preview')\n    at Shell (app/layout.tsx:42:13)",
  base64Image: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  bearerWord: "Bearer tokens expire after an hour",
  skWord: "sk-8 is the eighth key on the keyboard",
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
};

describe("redactString", () => {
  it("redacts every secret format by value", () => {
    for (const [name, secret] of Object.entries(SECRETS)) {
      const wrapped = `note about ${secret} in the middle`;
      const result = redactString(wrapped);
      expect(result, name).not.toContain(secret.slice(-12));
      expect(result, name).toContain(REDACTED);
      expect(result, name).toMatch(/^note about .* in the middle$/s);
    }
  });

  it("keeps legitimate content untouched in balanced mode (zero false positives)", () => {
    const flagged = Object.entries(LEGITIMATE).filter(([, text]) => redactString(text) !== text).map(([name]) => name);
    expect(flagged).toEqual([]);
  });

  it("keeps what is around a secret: scheme, host, path, the rest of the sentence", () => {
    expect(redactString(`Authorization: Bearer ${piece("eyJ", "hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop")}`)).toBe(`Authorization: Bearer ${REDACTED}`);
    expect(redactString("Basic dXNlcjpwYXNzd29yZDEyMzQ1Ng==")).toBe(`Basic ${REDACTED}`);
    expect(redactString("postgres://app:s3cr3t-pw@db.internal:5432/orders")).toBe(`postgres://app:${REDACTED}@db.internal:5432/orders`);
    expect(redactString("https://x.io/cb?code=abc&access_token=ya29.a0AfH6SMBx&state=1")).toBe(`https://x.io/cb?code=abc&access_token=${REDACTED}&state=1`);
    expect(redactString(`GET /maps?key=${SECRETS.google}&q=x`)).toBe(`GET /maps?key=${REDACTED}&q=x`);
  });

  it("strict mode also takes long random runs, and still spares hashes and ids", () => {
    const blob = "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z+/Ab3dEf6hIj9k=";
    expect(redactString(`payload ${blob} end`, "strict")).toBe(`payload ${REDACTED} end`);
    expect(redactString(`payload ${blob} end`)).toBe(`payload ${blob} end`);
    for (const name of ["sha256", "gitSha", "uuid", "isoDate", "sentence"]) {
      expect(redactString(LEGITIMATE[name]!, "strict"), name).toBe(LEGITIMATE[name]);
    }
  });

  it("does nothing when off, or on short strings", () => {
    expect(redactString(SECRETS.stripeLive!, "off")).toBe(SECRETS.stripeLive);
    expect(redactString("sk-1")).toBe("sk-1");
  });
});

describe("keyLooksSecret", () => {
  it("catches secret-shaped keys the exact list misses", () => {
    expect(keyLooksSecret("dbPassword", "hunter2")).toBe(true);
    expect(keyLooksSecret("STRIPE_SECRET_KEY", "whatever-this-is")).toBe(true);
    expect(keyLooksSecret("x-api-key", "abcd")).toBe(true);
    expect(keyLooksSecret("clientCredential", "abcd")).toBe(true);
    expect(keyLooksSecret("uploadToken", "Ab3dEf6hIj9kLm2nOp5qRs8t")).toBe(true);
    expect(keyLooksSecret("signingKey", "abcdef")).toBe(true);
  });

  it("leaves data that only sounds like a secret", () => {
    expect(keyLooksSecret("tokenCount", 1234)).toBe(false);
    expect(keyLooksSecret("tokens", ["a", "b"])).toBe(false);
    expect(keyLooksSecret("tokenType", "Bearer")).toBe(false);
    expect(keyLooksSecret("keyboard", "qwerty layout")).toBe(false);
    expect(keyLooksSecret("author", "Ada Lovelace")).toBe(false);
    expect(keyLooksSecret("primaryKey", "d061a841-a243-44d0-9a5b-463e5e6184ed")).toBe(false);
    expect(keyLooksSecret("cacheKey", "orders:page:2")).toBe(false);
    expect(keyLooksSecret("secret", "")).toBe(false);
  });
});

describe("normalizeValue with value redaction", () => {
  it("redacts inside strings, under hinted keys, and in error messages and stacks", () => {
    const result = normalizeValue({
      message: `charge failed with ${SECRETS.stripeLive}`,
      config: { dbPassword: "hunter2", tokenCount: 3 },
      url: "https://app:pw123456@host/x",
    }) as Record<string, unknown>;
    expect(result.message).toBe(`charge failed with ${REDACTED}`);
    expect(result.config).toEqual({ dbPassword: REDACTED, tokenCount: 3 });
    expect(result.url).toBe(`https://app:${REDACTED}@host/x`);

    const error = normalizeError(new Error(`Bad key ${SECRETS.githubClassic}`));
    expect(error.message).toBe(`Bad key ${REDACTED}`);
    expect(error.stack).toContain(REDACTED);
    expect(error.stack).not.toContain("ghp_");
  });

  it("honours redact: false and redactValues: 'off'", () => {
    expect(normalizeValue({ note: SECRETS.jwt }, { redact: false })).toEqual({ note: SECRETS.jwt });
    expect(normalizeValue({ note: SECRETS.jwt, password: "x" }, { redactValues: "off" })).toEqual({ note: SECRETS.jwt, password: REDACTED });
  });

  it("costs little: well under a few microseconds per ordinary string", () => {
    const sample = Array.from({ length: 200 }, (_, i) => ({
      id: LEGITIMATE.uuid,
      when: LEGITIMATE.isoDate,
      url: LEGITIMATE.url,
      text: `${LEGITIMATE.sentence} ${i}`,
      nested: { path: LEGITIMATE.path, agent: LEGITIMATE.userAgent, count: i },
    }));
    const time = (options: Parameters<typeof normalizeValue>[1]) => {
      let best = Infinity;
      for (let attempt = 0; attempt < 3; attempt++) {
        const start = performance.now();
        for (let round = 0; round < 20; round++) normalizeValue(sample, options);
        best = Math.min(best, performance.now() - start);
      }
      return best;
    };
    time({ redact: false });
    const without = time({ redact: false });
    const withRedaction = time({});
    // 20 rounds × 200 objects × 6 strings. Base normalization of a small object
    // is close to free, so a ratio would measure the wrong thing; the budget is
    // absolute: well under a few microseconds per string, on a slow CI machine.
    const strings = 20 * 200 * 6;
    const perString = ((withRedaction - without) * 1000) / strings;
    expect(perString, `redaction adds ${perString.toFixed(2)}µs per string (with ${withRedaction.toFixed(1)}ms, without ${without.toFixed(1)}ms)`).toBeLessThan(3);
  });
});

describe("the storage boundary", () => {
  const smuggled: StoredStory = {
    timestamp: "2026-09-04T12:00:00.000Z",
    level: "Error",
    title: `Deploy with ${SECRETS.awsAccessKey}`,
    storyId: "s1",
    origin: { who: "ci", where: { cookie: "session=abcdef" } },
    notes: [{ timestamp: "2026-09-04T12:00:00.000Z", note: `token ${SECRETS.slack} used`, what: { STRIPE_SECRET_KEY: piece("sk_test", "_x"), count: 2 } }],
    error: { message: `Bearer ${piece("eyJ", "hbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.abcdefghijklmnop")} rejected` },
  };

  it("redacts a story fed to a store by hand", async () => {
    const store = memoryStore();
    await store.append(smuggled);
    const kept = (await store.get("s1"))!;
    expect(kept.title).toBe(`Deploy with ${REDACTED}`);
    expect(kept.origin!.where).toEqual({ cookie: REDACTED });
    expect(kept.notes[0]!.note).toBe(`token ${REDACTED} used`);
    expect(kept.notes[0]!.what).toEqual({ STRIPE_SECRET_KEY: REDACTED, count: 2 });
    expect(kept.error!.message).toBe(`Bearer ${REDACTED} rejected`);
    expect(smuggled.title).toContain("AKIA");
  });

  it("can be told to trust the record", () => {
    expect(toStoredStory(smuggled, { redactValues: "off" }).title).toBe(smuggled.title);
  });

  it("changes nothing that is already clean", () => {
    const clean = normalizeValue({ order: { id: LEGITIMATE.uuid, note: LEGITIMATE.sentence, items: [1, 2] } });
    expect(redactJson(clean)).toEqual(clean);
  });
});

describe("auditRedaction", () => {
  it("reports what would be redacted, with a reason and a safe preview, without changing anything", () => {
    const value = normalizeValue(
      { password: "hunter2", note: `see ${SECRETS.stripeLive}`, config: { dbPassword: "abcdef", count: 1 }, list: [SECRETS.jwt, "fine"] },
      { redact: false }
    );
    const findings = auditRedaction(value, { redactKeys: new Set(["password"]) });
    expect(findings).toEqual([
      { path: "$.password", reason: "key", preview: "hunt…" },
      { path: "$.note", reason: "pattern", preview: "see …" },
      { path: "$.config.dbPassword", reason: "key-hint", preview: "abcd…" },
      { path: "$.list[0]", reason: "pattern", preview: "eyJh…" },
    ]);
    expect((value as { note: string }).note).toContain("sk_live_");
    expect(auditRedaction(normalizeValue({ password: "x" }))).toEqual([]);
  });

  it("tells strict-only findings apart", () => {
    const blob = "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z+/Ab3dEf6hIj9k=";
    expect(auditRedaction({ blob }, { strictness: "strict" })).toEqual([{ path: "$.blob", reason: "entropy", preview: "Ab3d…" }]);
    expect(auditRedaction({ blob })).toEqual([]);
  });
});
