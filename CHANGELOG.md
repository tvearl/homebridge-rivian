# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## 1.0.1

- Fix accessory naming so each control shows a proper name in the Home app
  (e.g. "Preconditioning", "Windows", "Frunk") instead of "Switch 1/2/3", by
  setting the `ConfiguredName` characteristic on every service.
- Fix charging detection: `charging_ready` (plugged in, not charging) is no
  longer reported as actively charging.
- Refresh a vehicle's state shortly after sending a command so switches
  reflect the real state quickly instead of waiting for the next poll.
- Support Node.js 24 in `engines`.

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
