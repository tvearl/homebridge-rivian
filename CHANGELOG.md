# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## 1.0.0

Initial release.

- Dynamic platform plugin for Rivian vehicles (R1T / R1S / R2).
- In-browser setup wizard (no command line): sign in, MFA, vehicle selection,
  and phone-key enrollment from the plugin's settings page.
- `rivian-homebridge-auth` CLI as a headless alternative (enroll / status /
  disenroll).
- HomeKit accessories: lock/unlock, battery % + charging, cabin
  preconditioning, all windows, frunk, tailgate/liftgate, powered tonneau.
- Command signing via secp256r1 ECDH + HKDF-SHA256 + HMAC-SHA256.
- Per-control enable/disable toggles and configurable polling interval.
