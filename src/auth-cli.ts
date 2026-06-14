#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';

import { RivianClient } from './rivianClient';
import { generateKeyPair } from './crypto';
import { finalizeEnrollment } from './enroll';
import { deleteStore, loadStore, saveStore } from './persist';
import { DEFAULT_DEVICE_NAME } from './settings';

interface Args {
  command: 'enroll' | 'disenroll' | 'status';
  storagePath: string;
  deviceName: string;
}

function parseArgs(argv: string[]): Args {
  let command: Args['command'] = 'enroll';
  let storagePath = process.env.UIX_STORAGE_PATH || process.env.HOMEBRIDGE_STORAGE_PATH || '';
  let deviceName = DEFAULT_DEVICE_NAME;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === 'disenroll' || arg === 'status' || arg === 'enroll') {
      command = arg;
    } else if (arg === '--storage' || arg === '-U') {
      storagePath = argv[++i];
    } else if (arg === '--name') {
      deviceName = argv[++i];
    }
  }

  if (!storagePath) {
    storagePath = path.join(os.homedir(), '.homebridge');
  }
  return { command, storagePath, deviceName };
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    let muted = false;
    const mutedOut = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) {
          process.stdout.write(chunk, encoding);
        }
        callback();
      },
    });
    const rl = readline.createInterface({ input: process.stdin, output: mutedOut, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
    muted = true;
  });
}

async function runEnroll(args: Args): Promise<void> {
  console.log(`\nRivian phone-key enrollment (storage: ${args.storagePath})\n`);
  console.log('Your password is sent only to Rivian and is never saved to disk.\n');

  const email = await prompt('Rivian email: ');
  const password = await promptHidden('Rivian password: ');

  const client = new RivianClient();
  await client.createCsrfToken();
  const { otpRequired } = await client.login(email, password);

  if (otpRequired) {
    console.log('\nMFA is enabled on this account. Check your email/SMS for the code.');
    const code = await prompt('Enter the OTP code: ');
    await client.loginWithOtp(email, code);
  }
  console.log('\nSigned in. Reading your vehicles...');

  const info = await client.getUserInfo(true);
  if (!info.vehicles.length) {
    throw new Error('No vehicles are associated with this Rivian account.');
  }

  info.vehicles.forEach((v, idx) => {
    console.log(`  [${idx + 1}] ${v.name} (${v.model || 'Rivian'}, VIN ${v.vin})`);
  });
  const selection = await prompt('\nVehicle numbers to control (comma separated, blank = all): ');
  const vehicleIds = selection
    ? selection
        .split(',')
        .map((s) => Number(s.trim()) - 1)
        .filter((i) => i >= 0 && i < info.vehicles.length)
        .map((i) => info.vehicles[i].id)
    : info.vehicles.map((v) => v.id);

  console.log(`\nEnrolling phone key "${args.deviceName}" (uses 1 of your 2 key slots per vehicle)...`);
  const keyPair = generateKeyPair();
  const store = await finalizeEnrollment(client, {
    deviceName: args.deviceName,
    deviceType: args.deviceName,
    keyPair,
    vehicleIds,
  });
  saveStore(args.storagePath, store);

  console.log('\nDone. Enrolled vehicles:');
  for (const v of Object.values(store.vehicles)) {
    console.log(`  - ${v.name} (${v.vin})`);
  }
  console.log('\nRestart Homebridge (or the child bridge) to load the new accessories.');
}

async function runStatus(args: Args): Promise<void> {
  const store = loadStore(args.storagePath);
  if (!store) {
    console.log('Not enrolled yet. Run `rivian-homebridge-auth` to sign in.');
    return;
  }
  console.log(`Enrolled as "${store.deviceName}" (phone id ${store.vasPhoneId}).`);
  for (const v of Object.values(store.vehicles)) {
    console.log(`  - ${v.name} (${v.vin})`);
  }
}

async function runDisenroll(args: Args): Promise<void> {
  const store = loadStore(args.storagePath);
  if (!store) {
    console.log('Nothing to disenroll.');
    return;
  }
  const client = new RivianClient(store.tokens);
  await client.createCsrfToken();
  const info = await client.getUserInfo(true);
  const phone = info.enrolledPhones.find((p) => p.publicKey === store.publicKeyHex);
  if (phone) {
    const ids = new Set(phone.enrolled.map((e) => e.identityId));
    for (const id of ids) {
      const ok = await client.disenrollPhone(id);
      console.log(`Disenrolled ${id}: ${ok ? 'ok' : 'failed'}`);
    }
  }
  deleteStore(args.storagePath);
  console.log('Local credentials removed.');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'status') {
    await runStatus(args);
  } else if (args.command === 'disenroll') {
    await runDisenroll(args);
  } else {
    await runEnroll(args);
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`);
  process.exit(1);
});
