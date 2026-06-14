import crypto from 'node:crypto';

/**
 * secp256r1 (a.k.a. prime256v1 / NIST P-256) key pair used to enroll this
 * Homebridge instance as a Rivian "phone key" and to sign vehicle commands.
 *
 * Keys are stored as raw hex:
 *  - `publicKeyHex`  - uncompressed point (0x04 || X || Y), the exact format
 *                      Rivian's EnrollPhone mutation expects.
 *  - `privateKeyHex` - raw private scalar.
 */
export interface KeyPair {
  publicKeyHex: string;
  privateKeyHex: string;
}

const CURVE = 'prime256v1';

/** Generate a fresh secp256r1 key pair for phone enrollment. */
export function generateKeyPair(): KeyPair {
  const ecdh = crypto.createECDH(CURVE);
  const publicKey = ecdh.generateKeys(); // uncompressed point buffer
  const privateKey = ecdh.getPrivateKey();
  return {
    publicKeyHex: publicKey.toString('hex'),
    privateKeyHex: privateKey.toString('hex'),
  };
}

/**
 * Derive the shared HMAC key exactly the way the Rivian app does:
 *   secret = ECDH(phonePrivateKey, vehiclePublicKey)
 *   key    = HKDF-SHA256(secret, salt = <empty>, info = <empty>, length = 32)
 *
 * Mirrors `get_secret_key` in bretterer/rivian-python-client utils.py.
 */
function deriveSecretKey(privateKeyHex: string, vehiclePublicKeyHex: string): Buffer {
  const ecdh = crypto.createECDH(CURVE);
  ecdh.setPrivateKey(Buffer.from(privateKeyHex, 'hex'));
  const sharedSecret = ecdh.computeSecret(Buffer.from(vehiclePublicKeyHex, 'hex'));
  const derived = crypto.hkdfSync('sha256', sharedSecret, Buffer.alloc(0), Buffer.alloc(0), 32);
  return Buffer.from(derived);
}

/**
 * Produce the hex HMAC signature for a vehicle command.
 *
 * Mirrors `generate_vehicle_command_hmac`: HMAC-SHA256(secretKey, command + timestamp).
 */
export function vehicleCommandHmac(
  command: string,
  timestamp: string,
  vehiclePublicKeyHex: string,
  privateKeyHex: string,
): string {
  const key = deriveSecretKey(privateKeyHex, vehiclePublicKeyHex);
  return crypto.createHmac('sha256', key).update(command + timestamp).digest('hex');
}
