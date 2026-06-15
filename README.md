<p align="center">
  <img src="https://raw.githubusercontent.com/homebridge/branding/latest/logos/homebridge-wordmark-logo-vertical.png" width="120">
</p>

# Homebridge Rivian

[![npm](https://img.shields.io/npm/v/homebridge-rivian.svg)](https://www.npmjs.com/package/homebridge-rivian)
[![npm downloads](https://img.shields.io/npm/dt/homebridge-rivian.svg)](https://www.npmjs.com/package/homebridge-rivian)
[![license](https://img.shields.io/github/license/tvearl/homebridge-rivian)](LICENSE)
[![Donate](https://img.shields.io/badge/donate-Venmo-008CFF?logo=venmo&logoColor=white)](https://venmo.com/u/thomas-whippld)

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
- **For the one-time key pairing: a laptop/desktop with Bluetooth running Google Chrome or Microsoft Edge** (or Chrome on Android), that you can bring within Bluetooth range of the vehicle.
  - This is **required** and is a hard browser limitation: pairing uses the [Web Bluetooth API](https://developer.mozilla.org/docs/Web/API/Web_Bluetooth_API), which **does not work in any iPhone/iPad browser** (Apple does not implement it in iOS WebKit). Safari and Firefox are not supported on any platform.
  - You only need this once. After the key is paired, all control runs through Rivian's cloud and works from any Apple Home / iPhone normally - no laptop or Bluetooth needed again.
  - **Gen1 vehicles only** (the BLE pairing protocol for Gen2 has not been reverse-engineered).

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

The plugin stores a session token and a key that lives only on your Homebridge machine.

### Step 2 - Pair the key over Bluetooth from a laptop (REQUIRED for commands)

Enrolling registers the key, but Rivian will not execute commands from it until
it is **paired with the vehicle over Bluetooth** (the key shows `isPaired: false`
until then). Until you do this, **reads work but lock / climate / windows / etc.
silently do nothing** (the cloud accepts the command, but the truck ignores it).

This is a **one-time** step. You need a **laptop/desktop with Bluetooth running
Chrome or Edge** (Android Chrome also works). **iPhones/iPads cannot do this** -
no iOS browser supports Web Bluetooth (see Requirements).

1. Bring the laptop within Bluetooth range of the vehicle (sitting in or right
   next to it is best).
2. In the Homebridge UI, open the plugin **Settings** and click
   **Show pairing steps** under "Enable vehicle control".
3. Click **Open Bluetooth pairing page** for your vehicle. It opens a secure
   page (`https://<your-fork>.github.io/homebridge-rivian/pair.html`) with your
   data already loaded. (If you opened the Homebridge UI on a different machine,
   use **Copy pairing data** and paste it into that page on the laptop instead.)
4. On the **vehicle touchscreen**: Settings -> Drivers & Keys, select the
   `Homebridge` key and tap **Set Up**.
5. On the pairing page click **Connect to Bluetooth & pair**, choose
   **Rivian Phone Key** in the browser's Bluetooth chooser, and approve.

When it shows `SUCCESS`, the key is paired and commands work. From then on
everything works from your iPhone / Apple Home over the cloud.

### Advanced / headless alternative (Python)

If you'd rather pair from a command line on a Bluetooth-capable computer next to
the vehicle (instead of a browser):

```bash
pip install bleak cryptography   # Linux also: pip install dbus-fast
python scripts/pair_rivian_ble.py --auth /var/lib/homebridge/rivian-auth.json
```

Tap **Set Up** for the `Homebridge` key on the vehicle screen when it starts
scanning. It prints `SUCCESS` when paired.

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
| Cabin climate | Thermostat | Current cabin temp, Off/Heat/Cool/Auto, and a target temp (16-29 C / ~61-84 F). Maps to Rivian preconditioning. |
| Front seats | Heater/Cooler (Driver + Passenger) | One tile per seat: Off / Heat / Cool. Off by default. |
| Second-row seat heat | Switch | Heats both second-row seats. Off by default. |
| Steering wheel heat | Switch | Off by default. |
| Windows | Switch | On = open/vent all windows, off = close all (no per-window or partial vent via Rivian's API). |
| Frunk | Garage Door | Open / close with Open/Closed state (R1T and R1S). |
| Rear trunk | Garage Door (R1S liftgate) or Switch (R1T tailgate) | Auto-selected by model. R1S powered liftgate opens AND closes with state; R1T tailgate opens/drops (the API can't close it or report its position). |
| Tonneau | Garage Door | R1T with the powered tonneau only; automatically hidden on R1S. |

### Vehicle differences (auto-detected)

The plugin reads your vehicle's model and adjusts:

- **R1S:** rear closure is a powered **liftgate** (open + close); **no tonneau**.
- **R1T:** rear closure is the **tailgate** (open/drop); optional **tonneau** if equipped.
- Frunk, lock, climate, windows, battery, and (optional) front-seat heat/cool, second-row seat heat, and heated steering wheel work the same on both.
- **R1S only (optional, off by default):** third-row seat heating switch.
- **R1T only (optional, off by default):** gear tunnel side-bin release (two switches, left/right). The API can only open a bin - you close it by hand - so the switch reflects the bin's actual state.

### Settings

- **Polling interval** - how often vehicle state refreshes (default 60s, minimum 30s). Lower = faster updates but more API calls.
- **Controls to expose** - enable/disable each accessory above.
- **Verbose debug logging** - extra logs for troubleshooting.

---

## Important caveats (please read)

These are limits of Rivian's API, not bugs:

- **No partial window "vent."** Rivian's cloud API only supports opening or closing *all* windows together. There is no partial-vent command, so the Windows switch fully opens/closes.
- **No suspension / ride-height control.** Rivian's unofficial API has no command for ride height (kneel/low/standard/high), so it can't be exposed - even though the official app can do it.
- **Cabin preconditioning** is exposed as a Thermostat (current temp + target temp + on/off); Rivian decides whether to heat or cool to reach the target. Seat heat/cool and steering heat are simple on/off (level is fixed when on).
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
- **Commands do nothing (reads still work)** - the phone key almost certainly isn't paired yet. Complete "Step 2 - Pair the key over Bluetooth" above. You can confirm in the Rivian app that the `Homebridge` key shows as set up/paired.
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

## Support this project

This plugin is free and open source. If it's useful to you, a tip is appreciated (entirely optional):

- **Venmo:** [@thomas-whippld](https://venmo.com/u/thomas-whippld)
- **GitHub Sponsors:** [github.com/sponsors/tvearl](https://github.com/sponsors/tvearl) _(pending approval)_

## License

[MIT](LICENSE)
