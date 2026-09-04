# Security Policy

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it privately via email:

**contact@lovelaces.io**

Do not open public GitHub issues for security vulnerabilities.

We will acknowledge receipt within 48 hours and provide a timeline for a fix.

## Redaction Is Best-Effort

`report()` redacts values whose **key names** look like secrets (`password`, `token`, `apiKey`, `authorization`, `cookie`, `sessionId`, `privateKey`, and similar — matched regardless of casing and separators). It does not inspect values, so a secret stored under an unrecognized key passes through. Treat it as defense in depth, not a guarantee, and keep secrets out of what you report where you can.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.3.x   | Yes       |
| < 0.3   | No — upgrade; every 0.2 call site still works |
