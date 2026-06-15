# Security Policy

## Supported versions

The latest published version on npm receives fixes. Please update before
reporting an issue.

## Reporting a vulnerability

Please report security issues **privately** rather than opening a public issue:

- Preferred: open a private report via GitHub Security Advisories at
  https://github.com/tvearl/homebridge-rivian/security/advisories/new
- You'll get a response as soon as reasonably possible.

When reporting, do **not** include secrets. Never paste:

- Rivian session tokens or your `rivian-auth.json` file
- Your VIN or account email/password
- The pairing "blob" / private key material

Redact those from any logs or screenshots.

## Notes

- This is an **unofficial** plugin and is not affiliated with Rivian. It uses
  Rivian's private API, which can change at any time.
- Credentials handled by the plugin (session tokens and a locally generated
  command-signing key) are stored only in your Homebridge storage directory and
  are never transmitted anywhere except to Rivian's own API.
