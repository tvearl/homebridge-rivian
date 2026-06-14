import { RivianClient } from './rivianClient';
import type { KeyPair } from './crypto';
import { RivianAuthStore, StoredVehicle, STORE_VERSION } from './persist';

export interface FinalizeOptions {
  deviceName: string;
  deviceType: string;
  keyPair: KeyPair;
  /** Vehicle ids the user chose to control. */
  vehicleIds: string[];
}

/**
 * Enroll the generated public key for each selected vehicle, then re-read the
 * account to collect the ids needed for command signing and build the store.
 *
 * Requires `client` to already be authenticated (login / loginWithOtp done).
 */
export async function finalizeEnrollment(
  client: RivianClient,
  opts: FinalizeOptions,
): Promise<RivianAuthStore> {
  const info = await client.getUserInfo(true);

  for (const vehicleId of opts.vehicleIds) {
    const ok = await client.enrollPhone({
      userId: info.userId,
      vehicleId,
      publicKey: opts.keyPair.publicKeyHex,
      deviceType: opts.deviceType,
      deviceName: opts.deviceName,
    });
    if (!ok) {
      throw new Error(`Rivian rejected phone-key enrollment for vehicle ${vehicleId}.`);
    }
  }

  // Re-read so we pick up the freshly created enrollment ids.
  const after = await client.getUserInfo(true);
  const phone =
    after.enrolledPhones.find((p) => p.publicKey === opts.keyPair.publicKeyHex) ??
    after.enrolledPhones[after.enrolledPhones.length - 1];

  if (!phone?.vasPhoneId) {
    throw new Error('Enrollment succeeded but no phone key id was returned by Rivian.');
  }

  const vehicles: Record<string, StoredVehicle> = {};
  for (const vehicleId of opts.vehicleIds) {
    const v = after.vehicles.find((x) => x.id === vehicleId);
    if (!v) {
      continue;
    }
    const entry =
      phone.enrolled.find((e) => e.vehicleId === vehicleId && e.deviceName === opts.deviceName) ??
      phone.enrolled.find((e) => e.vehicleId === vehicleId);

    if (!v.vehiclePublicKey) {
      throw new Error(`Vehicle ${v.name} did not report a public key; cannot sign commands.`);
    }
    if (!entry?.identityId) {
      throw new Error(`Could not resolve the enrollment identity for vehicle ${v.name}.`);
    }

    vehicles[vehicleId] = {
      id: v.id,
      vin: v.vin,
      name: v.name,
      model: v.model,
      modelYear: v.modelYear,
      vehiclePublicKey: v.vehiclePublicKey,
      vasVehicleId: v.vasVehicleId,
      identityId: entry.identityId,
      supportedFeatures: Object.fromEntries((v.supportedFeatures ?? []).map((f) => [f.name, f.status])),
    };
  }

  if (!Object.keys(vehicles).length) {
    throw new Error('No vehicles were enrolled.');
  }

  return {
    version: STORE_VERSION,
    tokens: client.getTokens(),
    privateKeyHex: opts.keyPair.privateKeyHex,
    publicKeyHex: opts.keyPair.publicKeyHex,
    userId: info.userId,
    deviceName: opts.deviceName,
    vasPhoneId: phone.vasPhoneId,
    vehicles,
  };
}
