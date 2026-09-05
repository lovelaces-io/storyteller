# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via email:

**contact@lovelaces.io**

Do not open public GitHub issues for security vulnerabilities.

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Redaction: what it does, and what it does not guarantee

Storyteller redacts in three places, and none of them is a guarantee.

**At capture**, `report()` and `normalizeValue()` redact:

- values under **key names** that are secrets by convention (`password`, `token`, `apiKey`, `authorization`, `cookie`, `sessionId`, `privateKey`, and similar — matched regardless of casing and separators), whatever the value is;
- string values under **secret-shaped keys** (`dbPassword`, `x-api-key`, `STRIPE_SECRET_KEY`, `clientCredential`; and `…token`, `…key`, `…auth` when the value also looks random);
- **recognisable secret formats inside any string**, including error messages and stack traces: Stripe, OpenAI/Anthropic, GitHub, GitLab, npm, Slack, Google and SendGrid keys, AWS access key ids, JWTs, PEM private keys, `Bearer`/`Basic` credentials, passwords in URL userinfo, and secrets in query parameters. Only the secret span is replaced; the text around it stays.

**At the storage boundary**, a `StoryStore` runs the same pass again on the way in, so a record fed by hand, or normalized with redaction off, is covered before it becomes durable.

**On demand**, `auditRedaction()` reports what would be redacted across a value without changing it, so a team can measure coverage over real stories instead of trusting it.

What this does **not** do: it does not recognise a secret that looks like an ordinary word, a secret in a format it has no pattern for, or a secret split across values. `redactValues: "strict"` also removes any long random-looking string, at the cost of some legitimate content. Treat all of it as defense in depth. Keep secrets out of what you report where you can, and keep `redact` on where you cannot.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.4.x   | Yes       |
| 0.3.x   | Yes       |
| < 0.3   | No — upgrade; every 0.2 call site still works |
