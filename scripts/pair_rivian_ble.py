#!/usr/bin/env python3
"""One-time Bluetooth pairing for the homebridge-rivian phone key.

WHY THIS IS NEEDED
------------------
Enrolling the phone key via the cloud (the setup wizard) registers the public
key but leaves it `isPaired: false`. Rivian will not execute signed commands
from an unpaired key, so lock/climate/etc. silently do nothing even though the
cloud accepts them. This script performs the local BLE pairing handshake that
flips the key to paired, exactly like tapping "Set Up" for a key in the app.

REQUIREMENTS
------------
- Run this on a computer with Bluetooth that is INSIDE / right next to the truck.
- The truck must be advertising for setup: in the Rivian app open
  Settings -> Digital Keys (or Drivers & Keys), find the "Homebridge" key and
  tap "Set Up" / "Pair" so the vehicle broadcasts "Rivian Phone Key".
- Python deps:  pip install bleak cryptography
  (On Linux/Raspberry Pi also:  pip install dbus-fast)
- The rivian-auth.json written by the plugin must be readable here. On the Pi
  it lives at /var/lib/homebridge/rivian-auth.json (run with sudo).

USAGE
-----
  python pair_rivian_ble.py --auth /var/lib/homebridge/rivian-auth.json
  python pair_rivian_ble.py --auth rivian-auth.json --vehicle <VIN>
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import hmac
import json
import platform
import secrets
import sys
import urllib.request
import uuid
from pathlib import Path

# --- BLE constants (from rivian-python-client/ble.py) ---
DEVICE_LOCAL_NAME = "Rivian Phone Key"
ACTIVE_ENTRY_UUID = "5249565F-4D4F-424B-4559-5F5752495445"
PHONE_ID_VEHICLE_ID_UUID = "AA49565A-4D4F-424B-4559-5F5752495445"
PHONE_NONCE_VEHICLE_NONCE_UUID = "E020A15D-E730-4B2C-908B-51DAF9D41E19"
CONNECT_TIMEOUT = 15.0
NOTIFY_TIMEOUT = 8.0

GRAPHQL_GATEWAY = "https://rivian.com/api/gql/gateway/graphql"
APOLLO_CLIENT_NAME = "com.rivian.ios.consumer-apollo-ios"


def derive_secret_key(private_key_hex: str, vehicle_public_key_hex: str) -> bytes:
    """ECDH(secp256r1) shared secret -> HKDF-SHA256(len 32). Matches the plugin."""
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives.kdf.hkdf import HKDF

    private_key = ec.derive_private_key(int(private_key_hex, 16), ec.SECP256R1())
    public_key = ec.EllipticCurvePublicKey.from_encoded_point(
        ec.SECP256R1(), bytes.fromhex(vehicle_public_key_hex)
    )
    shared = private_key.exchange(ec.ECDH(), public_key)
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"").derive(shared)


def ble_hmac(phone_nonce: bytes, private_key_hex: str, vehicle_public_key_hex: str) -> bytes:
    secret = derive_secret_key(private_key_hex, vehicle_public_key_hex)
    return hmac.new(secret, phone_nonce, hashlib.sha256).digest()


def _gql(headers: dict, body: dict) -> dict:
    base = {
        "User-Agent": "RivianApp/707 CFNetwork/1237 Darwin/20.4.0",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Apollographql-Client-Name": APOLLO_CLIENT_NAME,
        "dc-cid": f"m-ios-{uuid.uuid4()}",
    }
    base.update(headers)
    req = urllib.request.Request(
        GRAPHQL_GATEWAY, data=json.dumps(body).encode(), headers=base, method="POST"
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read())


def fetch_vas_vehicle_id(user_session_token: str, vehicle_id: str) -> str | None:
    """Look up the VAS vehicle id (needed for the BLE handshake)."""
    csrf = _gql(
        {},
        {
            "operationName": "CreateCSRFToken",
            "query": "mutation CreateCSRFToken { createCsrfToken { __typename csrfToken appSessionToken } }",
            "variables": None,
        },
    )["data"]["createCsrfToken"]
    headers = {
        "A-Sess": csrf["appSessionToken"],
        "U-Sess": user_session_token,
        "Csrf-Token": csrf["csrfToken"],
    }
    data = _gql(
        headers,
        {
            "operationName": "getUserInfo",
            "query": "query getUserInfo { currentUser { __typename id vehicles { id vin vas { __typename vasVehicleId vehiclePublicKey } } } }",
            "variables": None,
        },
    )
    for v in data.get("data", {}).get("currentUser", {}).get("vehicles", []) or []:
        if v.get("id") == vehicle_id:
            return (v.get("vas") or {}).get("vasVehicleId")
    return None


async def pair(store: dict, vehicle: dict) -> bool:
    from bleak import BleakClient, BleakScanner

    phone_id = store["vasPhoneId"]
    vas_vehicle_id = vehicle.get("vasVehicleId")
    vehicle_key = vehicle["vehiclePublicKey"]
    private_key = store["privateKeyHex"]

    if not vas_vehicle_id:
        print("Looking up VAS vehicle id...")
        vas_vehicle_id = fetch_vas_vehicle_id(store["tokens"]["userSessionToken"], vehicle["id"])
        if not vas_vehicle_id:
            print("ERROR: could not determine vasVehicleId for this vehicle.")
            return False

    print(f'Scanning for "{DEVICE_LOCAL_NAME}" (make sure the truck is in Set Up mode)...')
    device = await BleakScanner().find_device_by_name(DEVICE_LOCAL_NAME, timeout=30.0)
    if not device:
        print('ERROR: vehicle not found over Bluetooth. Be next to the truck and select')
        print('       "Set Up" for the Homebridge key in the Rivian app, then retry.')
        return False
    print(f"Found {device}. Connecting...")

    # On Linux, make the adapter pairable for bonding.
    if platform.system() == "Linux":
        try:
            from dbus_fast import BusType  # type: ignore
            from dbus_fast.aio import MessageBus  # type: ignore

            path = "/org/bluez/hci0"
            bus = await MessageBus(bus_type=BusType.SYSTEM).connect()
            intro = await bus.introspect("org.bluez", path)
            obj = bus.get_proxy_object("org.bluez", path, intro)
            iface = obj.get_interface("org.bluez.Adapter1")
            if not await iface.get_pairable():
                await iface.set_pairable(True)
            bus.disconnect()
        except Exception as ex:  # pylint: disable=broad-except
            print(f"(warning: could not set adapter pairable: {ex})")

    vehicle_id_event = asyncio.Event()
    vehicle_id_data: dict[str, bytes] = {}
    nonce_event = asyncio.Event()

    def on_vehicle_id(_, data: bytearray) -> None:
        vehicle_id_data["v"] = bytes(data)
        vehicle_id_event.set()

    def on_nonce(_, __: bytearray) -> None:
        nonce_event.set()

    try:
        async with BleakClient(device, timeout=CONNECT_TIMEOUT) as client:
            print("Connected. Validating vehicle id...")
            await client.start_notify(PHONE_ID_VEHICLE_ID_UUID, on_vehicle_id)
            await client.start_notify(PHONE_NONCE_VEHICLE_NONCE_UUID, on_nonce)

            await client.write_gatt_char(
                PHONE_ID_VEHICLE_ID_UUID, bytes.fromhex(phone_id.replace("-", ""))
            )
            await asyncio.wait_for(vehicle_id_event.wait(), NOTIFY_TIMEOUT)

            got = vehicle_id_data["v"].hex()
            if got != vas_vehicle_id.replace("-", ""):
                print(f"ERROR: vehicle id mismatch (got {got}, expected {vas_vehicle_id}).")
                return False

            print("Exchanging nonce (signing with the enrolled key)...")
            phone_nonce = secrets.token_bytes(16)
            mac = ble_hmac(phone_nonce, private_key, vehicle_key)
            await client.write_gatt_char(PHONE_NONCE_VEHICLE_NONCE_UUID, phone_nonce + mac)
            await asyncio.wait_for(nonce_event.wait(), NOTIFY_TIMEOUT)

            print("Authenticated. Bonding...")
            if platform.system() == "Darwin":
                await client.start_notify(ACTIVE_ENTRY_UUID, lambda _, __: None)
            else:
                await client.pair()

            print("\nSUCCESS: the Homebridge key is now paired. Commands should work.")
            return True
    except Exception as ex:  # pylint: disable=broad-except
        print(f"ERROR during pairing: {ex}")
        print('Make sure you are in the truck and selected "Set Up" for the Homebridge key.')
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Pair the homebridge-rivian phone key over BLE")
    parser.add_argument(
        "--auth",
        default="/var/lib/homebridge/rivian-auth.json",
        help="Path to rivian-auth.json (default: Homebridge storage path)",
    )
    parser.add_argument("--vehicle", help="VIN or vehicle id to pair (default: first enrolled)")
    args = parser.parse_args()

    try:
        import bleak  # noqa: F401
        import cryptography  # noqa: F401
    except ImportError:
        print("Missing dependencies. Install with:\n  pip install bleak cryptography")
        if platform.system() == "Linux":
            print("  pip install dbus-fast   # Linux only, for bonding")
        return 1

    store = json.loads(Path(args.auth).read_text(encoding="utf-8"))
    vehicles = list(store.get("vehicles", {}).values())
    if not vehicles:
        print("No enrolled vehicles found in the auth file.")
        return 1

    vehicle = vehicles[0]
    if args.vehicle:
        match = [v for v in vehicles if args.vehicle in (v.get("vin"), v.get("id"))]
        if not match:
            print(f"Vehicle {args.vehicle} not found in the auth file.")
            return 1
        vehicle = match[0]

    print(f"Pairing key '{store.get('deviceName')}' with vehicle {vehicle.get('name')} ({vehicle.get('vin')}).")
    ok = asyncio.run(pair(store, vehicle))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
