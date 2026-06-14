<p align="center">
  <img src="https://raw.githubusercontent.com/homebridge/branding/latest/logos/homebridge-wordmark-logo-vertical.png" width="120">
</p>

# Homebridge Rivian

[![npm](https://img.shields.io/npm/v/homebridge-rivian.svg)](https://www.npmjs.com/package/homebridge-rivian)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-rivian.svg)](https://www.npmjs.com/package/homebridge-rivian)
[![license](https://img.shields.io/npm/l/homebridge-rivian.svg)](LICENSE)

Control your **Rivian** (R1T, R1S, R2) from the Apple **Home** app and Siri, through [Homebridge](https://homebridge.io).

- Lock / unlock
- Battery % and charging status
- Cabin preconditioning (warm up / cool down)
- Open / close all windows
- Front trunk (frunk)
- Tailgate / liftgate
- Powered tonneau cover (R1T)

> **Unofficial.** This project is not affiliated with, endorsed by, or supported by Rivian. It uses the same private API the Rivian mobile app uses. APIs can change at any time and break the plugin.

---

## Requirements

- A working [Homebridge](https://github.com/homebridge/homebridge/wiki) install (the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) is strongly recommended).
- Your **Rivian account** email and password (the same one you use in the Rivian app).
- A free **phone-key slot**. Rivian allows **2 phone keys per vehicle**; this plugin uses one of them. If both are in use, remove one in the Rivian app first (Profile -> your vehicle -> Digital Keys), or remove it later from this plugin.

---

## Install

### Option A - Homebridge UI (recommended)

1. Open the Homebridge UI in your browser.
2. Go to the **Plugins** tab and search for **`homebridge-rivian`**.
3. Click **Install**.

### Option B - Command line

```bash
sudo hb-service add homebridge-rivian
# or, for a manual Homebridge install:
sudo npm install -g homebridge-rivian
```

---

## Connect your Rivian (the setup wizard)

After installing, you connect your account from the plugin's settings page. **No command line needed.**

1. In the Homebridge UI **Plugins** tab, find **Homebridge Rivian** and click **Settings**.
2. At the top you'll see the **Sign in & enroll** panel.
3. Enter your **Rivian email and password**, then click **Continue**.
   - Your password is sent only to Rivian to log in. It is **never saved** to disk.
4. If your account uses two-factor authentication, you'll be asked for the **verification code** Rivian texts/emails you. Enter it and click **Verify**.
5. Pick which **vehicle(s)** you want to control, give the key a name (default `Homebridge`), and click **Enroll & finish**.
   - This registers a digital "phone key" for each selected vehicle. It will appear in the Rivian app under your vehicle's Digital Keys, and **uses one of your two key slots per vehicle**.
6. **Restart Homebridge** (or the child bridge) when prompted. Your Rivian accessories now appear in the Home app.

That's it. The plugin stores a session token and a key that lives only on your Homebridge machine.

### Headless / Docker alternative (CLI)

If you can't use the UI, run the bundled CLI on the Homebridge host:

```bash
# enroll (interactive: email, password, MFA code, vehicle selection)
rivian-homebridge-auth --storage /var/lib/homebridge

# check status
rivian-homebridge-auth status --storage /var/lib/homebridge

# remove the key from your account and delete local credentials
rivian-homebridge-auth disenroll --storage /var/lib/homebridge
```

`--storage` should point at your Homebridge storage directory (where `config.json` lives). It defaults to `~/.homebridge`.

---

## What you get in HomeKit

The plugin creates one accessory per vehicle, with these services (each can be turned off in settings):

| Control | HomeKit type | Notes |
| --- | --- | --- |
| Lock / unlock | Lock | Locks/unlocks all closures. State reflects your doors. |
| Battery % | Humidity sensor + Battery | Shows state of charge as a percentage. |
| Charging | Contact sensor | "Open" while the vehicle is charging. |
| Preconditioning | Switch | Turns cabin climate preconditioning on/off. |
| Windows | Window (slider) | 100% = open all, 0% = close all (snaps; no per-window or vent position via Rivian's API). |
| Frunk | Garage Door | Open / close with Open/Closed state. |
| Tailgate / liftgate | Switch | On = open/drop. Close works only where supported; some vehicles do not report tailgate position. |
| Tonneau | Garage Door | R1T powered tonneau only; Open/Closed state. |

### Settings

- **Polling interval** - how often vehicle state refreshes (default 60s, minimum 30s). Lower = faster updates but more API calls.
- **Controls to expose** - enable/disable each accessory above.
- **Verbose debug logging** - extra logs for troubleshooting.

---

## Important caveats (please read)

These are limits of Rivian's API, not bugs:

- **No partial window "vent."** Rivian's cloud API only supports opening or closing *all* windows together. There is no partial-vent command, so the Windows switch fully opens/closes.
- **No individual seat heating/cooling.** Those are not exposed as standalone cloud commands, so they are not included.
- **Preconditioning is on/off**, not a full live thermostat. The switch enables/disables cabin preconditioning; it doesn't set a target temperature in HomeKit.
- **The vehicle may be asleep.** Commands first try directly, then wake the vehicle and retry. The first command after a long idle period can take a few extra seconds.
- **Some controls depend on your vehicle/options** (e.g. powered tonneau is R1T-only; liftgate close is R1S). Unsupported commands simply do nothing on the car.

---

## Security & privacy

- Your **password is never stored**. It's used once to obtain session tokens.
- The plugin generates a **secp256r1 key pair locally**. Only the *public* half is sent to Rivian (for enrollment). The private key stays on your machine and is used to sign commands.
- Tokens and the key are saved to `rivian-auth.json` in your Homebridge storage directory, with restrictive file permissions. Keep that file private and never commit it to a repo.
- To revoke access, click **Disconnect & remove key** in the plugin settings (or run `rivian-homebridge-auth disenroll`). This removes the phone key from your Rivian account and deletes the local credentials. You can also remove it any time from the Rivian app.

---

## Troubleshooting

- **"Not signed in yet" in the logs** - open the plugin settings and complete the Sign in & enroll wizard.
- **Commands do nothing** - make sure enrollment succeeded (the key shows under Digital Keys in the Rivian app) and that you didn't hit the 2-key limit.
- **"Rivian session expired"** - re-run the sign-in wizard to refresh your session.
- **Phone key limit reached** - remove an unused key in the Rivian app (Profile -> vehicle -> Digital Keys) and enroll again.
- **Enable Verbose debug logging** in settings to see detailed request/error logs, then check the Homebridge logs.

---

## How it works

```
Setup wizard (login + MFA + EnrollPhone)
        |
        v
rivian-auth.json  (session tokens + local key + vehicle ids)
        |
        v
Homebridge platform  --- poll state --->  Rivian GraphQL API
                     --- signed commands ->
        |
        v
HomeKit accessories (Apple Home app)
```

Commands are signed exactly like the Rivian app: an ECDH shared secret between your enrolled key and the vehicle's key is run through HKDF-SHA256, then used as the HMAC-SHA256 key over `command + timestamp`.

---

## Credits

- The community that reverse-engineered the Rivian API, especially [bretterer/rivian-python-client](https://github.com/bretterer/rivian-python-client) and the [RivDocs](https://rivian-api.kaedenb.org/) project.

## Contributing

Issues and PRs welcome. Please don't include any tokens, VINs, or the contents of `rivian-auth.json` in bug reports.

## License

[MIT](LICENSE)
