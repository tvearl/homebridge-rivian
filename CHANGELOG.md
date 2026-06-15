# Changelog

All notable changes to this project are documented here. This project adheres
to [Semantic Versioning](https://semver.org/).

## 1.3.2

- Rename the windows control to "Vent Windows" to better reflect what it does
  (vent/open all windows or close all).

## 1.3.1

- Fix the cabin climate (Thermostat) flipping back on a few seconds after you
  turn it Off. The vehicle's preconditioning status lags a command, and the
  state poll was reflecting the stale value. Recent user actions are now honored
  for a short grace period, and Off is reflected immediately.

## 1.3.0

- Front seats are now **Heater/Cooler tiles** (Driver + Passenger) that switch
  between Off / Heat / Cool, replacing the old front seat-cooling switch
  (`enableSeatCooling` still works as an alias for `enableFrontSeats`).
- Add optional **second-row seat heating** and **heated steering wheel** switches
  (both models).
- Note: Rivian's unofficial API exposes no suspension/ride-height command, so
  that can't be controlled.

## 1.2.0

- Add optional **third-row seat heating** switch for the R1S.
- Add optional **gear tunnel** side-bin controls for the R1T (left/right release
  switches; open-only, since the API can't close the bins - they reflect actual
  state). Both are off by default and shown only for the matching model.

## 1.1.0

- R1S support: the rear closure is now model-aware. R1S gets a powered
  **liftgate (trunk)** Garage Door tile that opens AND closes with state; R1T
  keeps the drop **tailgate** switch. The **tonneau** control is automatically
  hidden on the R1S.
- Frunk, lock, climate, windows, seat cooling, and battery already work on both
  R1T and R1S.

## 1.0.7

- Pairing is now documented and presented as a laptop-browser step (Chrome/Edge,
  or Android Chrome). iPhone/iPad browsers can't do Web Bluetooth, so they can't
  pair - but control works from iPhone normally once paired.
- Wizard now offers a direct "Open Bluetooth pairing page" link (data pre-filled)
  in addition to copy/paste, and clearer device guidance.

## 1.0.6

- Add a phone-based Bluetooth pairing flow built into the setup wizard: a
  "Show pairing steps" panel hands your per-vehicle pairing data to a hosted
  HTTPS Web Bluetooth page you open on your phone (Bluefy on iOS, Chrome on
  Android) and tap Pair - no laptop, Raspberry Pi Bluetooth, or Python needed.
- Add the hosted pairing page (docs/pair.html) and a `/pairing-data` UI server
  endpoint (looks up vasVehicleId live if not stored).
- Improve the standalone pairing script's diagnostics (BLE GATT map dump).

## 1.0.5

- Cabin climate is now a Thermostat tile: shows current cabin temperature and
  lets you pick Off/Heat/Cool/Auto and a target temperature (16-29 C). Maps to
  Rivian cabin preconditioning + set-temp.
- Add an optional front Seat Cooling switch (off by default).
- Revert Windows to a single vent (open all) / close all switch, since Rivian's
  API has no per-window or partial-vent control.
- Add `scripts/pair_rivian_ble.py` to perform the one-time Bluetooth pairing of
  the enrolled phone key. This is REQUIRED for commands to work - an enrolled
  but unpaired key is accepted by the cloud but ignored by the vehicle.
- Store the VAS vehicle id at enrollment (used by BLE pairing).

## 1.0.4

- Windows are now a Window tile (slider): 100% opens all windows, 0% closes
  all (values snap, since Rivian's API has no per-window or partial/vent
  position). Position reflects the reported open/closed state.

## 1.0.3

- Frunk and tonneau are now exposed as Garage Door tiles (clear Open / Closed
  with opening/closing state) instead of plain switches. The old switch
  services are removed automatically on upgrade.

## 1.0.2

- Fix a HomeKit warning by sending `FirmwareRevision` (model year) as a string.

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
