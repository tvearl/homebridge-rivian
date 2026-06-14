'use strict';

const { HomebridgePluginUiServer, RequestError } = require('@homebridge/plugin-ui-utils');

const { RivianClient } = require('../dist/rivianClient');
const { generateKeyPair } = require('../dist/crypto');
const { finalizeEnrollment } = require('../dist/enroll');
const { loadStore, saveStore, deleteStore } = require('../dist/persist');
const { DEFAULT_DEVICE_NAME } = require('../dist/settings');

class RivianUiServer extends HomebridgePluginUiServer {
  constructor() {
    super();

    // Kept in memory only for the duration of the wizard session.
    this.session = null;

    this.onRequest('/status', this.handleStatus.bind(this));
    this.onRequest('/login', this.handleLogin.bind(this));
    this.onRequest('/verify-otp', this.handleVerifyOtp.bind(this));
    this.onRequest('/enroll', this.handleEnroll.bind(this));
    this.onRequest('/disenroll', this.handleDisenroll.bind(this));

    this.ready();
  }

  handleStatus() {
    const store = loadStore(this.homebridgeStoragePath);
    if (!store) {
      return { enrolled: false };
    }
    return {
      enrolled: true,
      deviceName: store.deviceName,
      vehicles: Object.values(store.vehicles).map((v) => ({ name: v.name, vin: v.vin, model: v.model })),
    };
  }

  async handleLogin(payload) {
    const email = (payload && payload.email || '').trim();
    const password = (payload && payload.password) || '';
    if (!email || !password) {
      throw new RequestError('Email and password are required.', { status: 400 });
    }

    try {
      const client = new RivianClient();
      await client.createCsrfToken();
      const { otpRequired } = await client.login(email, password);
      this.session = { client, email };

      if (otpRequired) {
        return { otpRequired: true };
      }
      const vehicles = await this.loadVehicles(client);
      return { otpRequired: false, vehicles };
    } catch (err) {
      throw new RequestError(err.message || 'Login failed.', { status: 401 });
    }
  }

  async handleVerifyOtp(payload) {
    if (!this.session || !this.session.client) {
      throw new RequestError('Start by entering your email and password.', { status: 400 });
    }
    const code = (payload && payload.code || '').trim();
    if (!code) {
      throw new RequestError('Enter the verification code Rivian sent you.', { status: 400 });
    }
    try {
      await this.session.client.loginWithOtp(this.session.email, code);
      const vehicles = await this.loadVehicles(this.session.client);
      return { vehicles };
    } catch (err) {
      throw new RequestError(err.message || 'Verification failed.', { status: 401 });
    }
  }

  async handleEnroll(payload) {
    if (!this.session || !this.session.client) {
      throw new RequestError('Your sign-in session expired. Please sign in again.', { status: 400 });
    }
    const vehicleIds = (payload && payload.vehicleIds) || [];
    const deviceName = (payload && payload.deviceName || '').trim() || DEFAULT_DEVICE_NAME;
    if (!vehicleIds.length) {
      throw new RequestError('Select at least one vehicle.', { status: 400 });
    }

    try {
      const keyPair = generateKeyPair();
      const store = await finalizeEnrollment(this.session.client, {
        deviceName,
        deviceType: deviceName,
        keyPair,
        vehicleIds,
      });
      saveStore(this.homebridgeStoragePath, store);
      this.session = null;
      return {
        success: true,
        vehicles: Object.values(store.vehicles).map((v) => ({ name: v.name, vin: v.vin })),
      };
    } catch (err) {
      throw new RequestError(err.message || 'Enrollment failed.', { status: 400 });
    }
  }

  async handleDisenroll() {
    const store = loadStore(this.homebridgeStoragePath);
    if (!store) {
      return { success: true };
    }
    try {
      const client = new RivianClient(store.tokens);
      await client.createCsrfToken();
      const info = await client.getUserInfo(true);
      const phone = info.enrolledPhones.find((p) => p.publicKey === store.publicKeyHex);
      if (phone) {
        const ids = [...new Set(phone.enrolled.map((e) => e.identityId))];
        for (const id of ids) {
          await client.disenrollPhone(id);
        }
      }
    } catch (err) {
      // Even if the remote disenroll fails, still clear local credentials.
    }
    deleteStore(this.homebridgeStoragePath);
    return { success: true };
  }

  async loadVehicles(client) {
    const info = await client.getUserInfo(true);
    return info.vehicles.map((v) => ({ id: v.id, name: v.name, vin: v.vin, model: v.model }));
  }
}

(() => new RivianUiServer())();
