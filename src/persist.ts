import fs from 'node:fs';
import path from 'node:path';
import { AUTH_FILE_NAME } from './settings';
import type { RivianTokens } from './rivianClient';

/** Per-vehicle data needed to read state and sign commands. */
export interface StoredVehicle {
  id: string;
  vin: string;
  name: string;
  model?: string;
  modelYear?: string;
  /** Vehicle's secp256r1 public key (hex) - the ECDH peer for command signing. */
  vehiclePublicKey: string;
  /** VAS vehicle id, needed for the BLE pairing handshake. */
  vasVehicleId?: string;
  /** Enrollment identity id for this phone-key/vehicle pair (sent as deviceId). */
  identityId: string;
  /** Supported feature flags reported by the vehicle (name -> status). */
  supportedFeatures?: Record<string, string>;
}

export interface RivianAuthStore {
  version: number;
  tokens: RivianTokens;
  /** Locally generated phone key (never leaves this machine except the public half). */
  privateKeyHex: string;
  publicKeyHex: string;
  userId: string;
  deviceName: string;
  /** Phone-key id returned after enrollment (sent as vasPhoneId). */
  vasPhoneId: string;
  vehicles: Record<string, StoredVehicle>;
}

export const STORE_VERSION = 1;

export function authFilePath(storagePath: string): string {
  return path.join(storagePath, AUTH_FILE_NAME);
}

export function loadStore(storagePath: string): RivianAuthStore | null {
  const file = authFilePath(storagePath);
  if (!fs.existsSync(file)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as RivianAuthStore;
    if (!parsed.tokens?.userSessionToken || !parsed.privateKeyHex) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveStore(storagePath: string, store: RivianAuthStore): void {
  const file = authFilePath(storagePath);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  // Best-effort tighten permissions (no-op on platforms that ignore it).
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    /* ignore */
  }
}

export function deleteStore(storagePath: string): void {
  const file = authFilePath(storagePath);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
  }
}
