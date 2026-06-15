import {
  API,
  Characteristic,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
  Service,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { RivianApiError, RivianClient } from './rivianClient';
import { loadStore, RivianAuthStore, StoredVehicle } from './persist';
import { Command, STATE_PROPERTIES, VehicleStateValues } from './commands';
import { flattenState } from './state';
import { LockAccessory } from './accessories/lock';
import { BatteryAccessory } from './accessories/battery';
import { ClimateAccessory } from './accessories/climate';
import { WindowsAccessory } from './accessories/windows';
import { FrunkAccessory } from './accessories/frunk';
import { TailgateAccessory } from './accessories/tailgate';
import { LiftgateAccessory } from './accessories/liftgate';
import { TonneauAccessory } from './accessories/tonneau';
import { SeatCoolingAccessory } from './accessories/seatCooling';

export interface RivianAccessory {
  update(values: VehicleStateValues): void;
}

export interface RivianPlatformConfig extends PlatformConfig {
  pollIntervalSeconds?: number;
  deviceName?: string;
  enableLock?: boolean;
  enableBattery?: boolean;
  enableClimate?: boolean;
  enableWindows?: boolean;
  enableFrunk?: boolean;
  enableTailgate?: boolean;
  enableTonneau?: boolean;
  enableSeatCooling?: boolean;
  debug?: boolean;
}

const DEFAULT_POLL_SECONDS = 60;
const MIN_POLL_SECONDS = 30;

export class RivianHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;

  public readonly accessories: PlatformAccessory[] = [];
  private readonly handlers = new Map<string, RivianAccessory[]>();

  private client?: RivianClient;
  private store: RivianAuthStore | null = null;
  private pollTimer?: NodeJS.Timeout;
  private sessionReady = false;

  constructor(
    public readonly log: Logging,
    public readonly config: RivianPlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.api.on('didFinishLaunching', () => {
      this.init().catch((err) => this.log.error('Initialization failed:', err));
    });

    this.api.on('shutdown', () => {
      if (this.pollTimer) {
        clearInterval(this.pollTimer);
      }
    });
  }

  configureAccessory(accessory: PlatformAccessory): void {
    this.accessories.push(accessory);
  }

  get cfg(): RivianPlatformConfig {
    return this.config;
  }

  private isEnabled(key: keyof RivianPlatformConfig): boolean {
    const value = this.config[key];
    return value === undefined ? true : Boolean(value);
  }

  private async init(): Promise<void> {
    this.store = loadStore(this.api.user.storagePath());
    if (!this.store) {
      this.log.warn(
        'Not signed in yet. Open this plugin\'s settings in the Homebridge UI and complete the ' +
          '"Sign in & enroll" wizard to connect your Rivian account.',
      );
      return;
    }

    this.client = new RivianClient(this.store.tokens);
    try {
      await this.client.createCsrfToken();
      this.sessionReady = true;
    } catch (err) {
      this.log.error('Could not establish a Rivian session:', (err as Error).message);
      return;
    }

    const vehicles = Object.values(this.store.vehicles);
    this.log.info(`Setting up ${vehicles.length} Rivian vehicle(s).`);
    for (const vehicle of vehicles) {
      this.setupVehicle(vehicle);
    }

    this.cleanupStaleAccessories(vehicles);

    const interval = Math.max(MIN_POLL_SECONDS, this.config.pollIntervalSeconds ?? DEFAULT_POLL_SECONDS);
    await this.pollAll();
    this.pollTimer = setInterval(() => {
      this.pollAll().catch((err) => this.log.debug('Poll error:', (err as Error).message));
    }, interval * 1000);
    this.log.info(`Polling vehicle state every ${interval}s.`);
  }

  private setupVehicle(vehicle: StoredVehicle): void {
    const uuid = this.api.hap.uuid.generate(`rivian:${vehicle.vin}`);
    let accessory = this.accessories.find((a) => a.UUID === uuid);

    if (!accessory) {
      accessory = new this.api.platformAccessory(vehicle.name, uuid);
      accessory.context.vehicleId = vehicle.id;
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      this.log.info(`Added new vehicle accessory: ${vehicle.name}`);
    } else {
      accessory.context.vehicleId = vehicle.id;
    }

    const info = accessory.getService(this.Service.AccessoryInformation)!;
    info
      .setCharacteristic(this.Characteristic.Manufacturer, 'Rivian')
      .setCharacteristic(this.Characteristic.Model, vehicle.model || 'Rivian')
      .setCharacteristic(this.Characteristic.Name, vehicle.name)
      .setCharacteristic(this.Characteristic.SerialNumber, vehicle.vin)
      .setCharacteristic(this.Characteristic.FirmwareRevision, String(vehicle.modelYear || '1.0.0'));

    const handlers: RivianAccessory[] = [];
    if (this.isEnabled('enableLock')) {
      handlers.push(new LockAccessory(this, accessory, vehicle));
    }
    if (this.isEnabled('enableBattery')) {
      handlers.push(new BatteryAccessory(this, accessory, vehicle));
    }
    if (this.isEnabled('enableClimate')) {
      handlers.push(new ClimateAccessory(this, accessory, vehicle));
    }
    if (this.isEnabled('enableWindows')) {
      handlers.push(new WindowsAccessory(this, accessory, vehicle));
    }
    if (this.isEnabled('enableFrunk')) {
      handlers.push(new FrunkAccessory(this, accessory, vehicle));
    }

    // Rear closures differ by model: R1S has a powered liftgate (trunk) that
    // opens AND closes; R1T has a drop tailgate and (optionally) a tonneau.
    const isR1S = /r1s/i.test(vehicle.model || '');
    if (this.isEnabled('enableTailgate')) {
      handlers.push(
        isR1S
          ? new LiftgateAccessory(this, accessory, vehicle)
          : new TailgateAccessory(this, accessory, vehicle),
      );
    }
    if (!isR1S && this.isEnabled('enableTonneau')) {
      handlers.push(new TonneauAccessory(this, accessory, vehicle));
    } else if (isR1S) {
      this.removeService(accessory, 'rivian-tonneau');
    }

    if (this.config.enableSeatCooling === true) {
      handlers.push(new SeatCoolingAccessory(this, accessory, vehicle));
    }

    this.handlers.set(vehicle.id, handlers);
  }

  private removeService(accessory: PlatformAccessory, subtype: string): void {
    const svc =
      accessory.getServiceById(this.Service.GarageDoorOpener, subtype) ||
      accessory.getServiceById(this.Service.Switch, subtype);
    if (svc) {
      accessory.removeService(svc);
    }
  }

  private cleanupStaleAccessories(vehicles: StoredVehicle[]): void {
    const validUuids = new Set(vehicles.map((v) => this.api.hap.uuid.generate(`rivian:${v.vin}`)));
    const stale = this.accessories.filter((a) => !validUuids.has(a.UUID));
    if (stale.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, stale);
      this.log.info(`Removed ${stale.length} stale accessory/accessories.`);
    }
  }

  private async pollVehicle(vehicle: StoredVehicle): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      const raw = await this.client.getVehicleState(vehicle.id, STATE_PROPERTIES);
      const values = flattenState(raw);
      for (const handler of this.handlers.get(vehicle.id) ?? []) {
        handler.update(values);
      }
    } catch (err) {
      this.handleApiError(err, `polling ${vehicle.name}`);
    }
  }

  private async pollAll(): Promise<void> {
    if (!this.store) {
      return;
    }
    for (const vehicle of Object.values(this.store.vehicles)) {
      await this.pollVehicle(vehicle);
    }
  }

  /** Refresh a single vehicle's state a few times after a command so the
   * switches reflect reality quickly instead of waiting for the next poll. */
  private scheduleRefresh(vehicle: StoredVehicle, delaysMs: number[] = [9000, 25000]): void {
    for (const ms of delaysMs) {
      setTimeout(() => {
        this.pollVehicle(vehicle).catch(() => undefined);
      }, ms);
    }
  }

  /**
   * Sign + send a command, waking the vehicle and retrying once if the first
   * attempt fails (common when the vehicle is asleep).
   */
  async sendCommand(
    vehicle: StoredVehicle,
    command: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.client || !this.store) {
      throw new Error('Rivian client is not initialized.');
    }
    try {
      await this.dispatch(vehicle, command, params);
    } catch (err) {
      this.log.debug(`First attempt for ${command} failed (${(err as Error).message}); waking and retrying.`);
      try {
        await this.dispatch(vehicle, Command.WAKE_VEHICLE);
        await delay(4000);
        await this.dispatch(vehicle, command, params);
      } catch (err2) {
        this.handleApiError(err2, `sending ${command} to ${vehicle.name}`);
        throw err2;
      }
    }
    // Command accepted - pull fresh state shortly so HomeKit reflects reality.
    this.scheduleRefresh(vehicle);
  }

  private async dispatch(
    vehicle: StoredVehicle,
    command: string,
    params?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.client || !this.store) {
      throw new Error('Rivian client is not initialized.');
    }
    if (!this.sessionReady) {
      await this.client.createCsrfToken();
      this.sessionReady = true;
    }
    await this.client.sendVehicleCommand({
      command,
      vehicleId: vehicle.id,
      phoneId: this.store.vasPhoneId,
      identityId: vehicle.identityId,
      vehiclePublicKey: vehicle.vehiclePublicKey,
      privateKey: this.store.privateKeyHex,
      params,
    });
    this.log.info(`Sent ${command} to ${vehicle.name}.`);
  }

  private handleApiError(err: unknown, context: string): void {
    if (err instanceof RivianApiError && err.code === 'UNAUTHENTICATED') {
      this.sessionReady = false;
      this.log.error(
        `Rivian session expired while ${context}. Re-open the plugin settings and run the ` +
          'sign-in wizard again to refresh your session.',
      );
      return;
    }
    this.log.debug(`Error while ${context}:`, (err as Error).message);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
