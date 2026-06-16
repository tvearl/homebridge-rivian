import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isSeatActive, toNumber } from '../state';
import { nameService } from './util';

// Rivian seat levels: 0 = off, 2 = low, 3 = medium, 4 = high.
// Exposed as a 3-speed fan (ventilation / cooling) per front seat.
const STEP = 100 / 3;
const DEFAULT_LEVEL = 3;
const COMMAND_GRACE_MS = 60_000;

function speedToLevel(pct: number): number {
  if (pct <= 0) {
    return 0;
  }
  if (pct < STEP * 1.5) {
    return 2; // speed 1 - low
  }
  if (pct < STEP * 2.5) {
    return 3; // speed 2 - medium
  }
  return 4; // speed 3 - high
}

function levelToSpeed(level: number): number {
  if (level <= 0) {
    return 0;
  }
  if (level <= 2) {
    return STEP;
  }
  if (level === 3) {
    return STEP * 2;
  }
  return 100;
}

interface SeatDef {
  subtype: string;
  name: string;
  ventCmd: string;
  ventProp: string;
}

/**
 * Front seat ventilation (cooling) as a 3-speed Fan per seat (Driver + Passenger):
 * Off / low / medium / high, mapped to Rivian's per-seat vent levels. Heat/cool
 * mode is intentionally omitted - HomeKit has no fan-with-mode type, so this is a
 * simple, reliable fan tile.
 */
export class FrontSeatsAccessory implements RivianAccessory {
  private readonly seats: { def: SeatDef; service: Service }[] = [];
  private lastCommandAt = 0;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;

    // Remove services from earlier versions (the old cooling Switch and the
    // HeaterCooler tiles) so only the Fan tiles remain.
    const staleCool = accessory.getServiceById(Service.Switch, 'rivian-seat-cooling');
    if (staleCool) {
      accessory.removeService(staleCool);
    }

    const defs: SeatDef[] = [
      {
        subtype: 'rivian-seat-driver',
        name: `${vehicle.name} Driver Seat`,
        ventCmd: Command.SEAT_FRONT_LEFT_VENT,
        ventProp: 'seatFrontLeftVent',
      },
      {
        subtype: 'rivian-seat-passenger',
        name: `${vehicle.name} Passenger Seat`,
        ventCmd: Command.SEAT_FRONT_RIGHT_VENT,
        ventProp: 'seatFrontRightVent',
      },
    ];

    for (const def of defs) {
      const staleHc = accessory.getServiceById(Service.HeaterCooler, def.subtype);
      if (staleHc) {
        accessory.removeService(staleHc);
      }

      const service =
        accessory.getServiceById(Service.Fanv2, def.subtype) ||
        accessory.addService(Service.Fanv2, def.name, def.subtype);
      nameService(this.platform, service, def.name);
      service.getCharacteristic(Characteristic.RotationSpeed).setProps({ minValue: 0, maxValue: 100, minStep: STEP });

      service.getCharacteristic(Characteristic.Active).onSet((v) => this.setActive(def, service, v));
      service.getCharacteristic(Characteristic.RotationSpeed).onSet((v) => this.setSpeed(def, service, v));
      this.seats.push({ def, service });
    }
  }

  private async setActive(def: SeatDef, service: Service, value: CharacteristicValue): Promise<void> {
    const { Characteristic } = this.platform;
    this.lastCommandAt = Date.now();
    const on = value === Characteristic.Active.ACTIVE;
    let level = 0;
    if (on) {
      level = speedToLevel(Number(service.getCharacteristic(Characteristic.RotationSpeed).value) || 0);
      if (level === 0) {
        level = DEFAULT_LEVEL;
        service.updateCharacteristic(Characteristic.RotationSpeed, levelToSpeed(level));
      }
    }
    await this.platform.sendCommand(this.vehicle, def.ventCmd, { level });
  }

  private async setSpeed(def: SeatDef, service: Service, value: CharacteristicValue): Promise<void> {
    const { Characteristic } = this.platform;
    this.lastCommandAt = Date.now();
    const level = speedToLevel(Number(value) || 0);
    // Keep the power state in sync with the slider.
    service.updateCharacteristic(
      Characteristic.Active,
      level > 0 ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
    );
    await this.platform.sendCommand(this.vehicle, def.ventCmd, { level });
  }

  update(values: VehicleStateValues): void {
    const { Characteristic } = this.platform;

    // Don't let a lagging state poll override a recent user action.
    if (Date.now() - this.lastCommandAt < COMMAND_GRACE_MS) {
      return;
    }

    for (const { def, service } of this.seats) {
      const active = isSeatActive(values[def.ventProp]);
      if (active === undefined) {
        continue;
      }
      service.updateCharacteristic(
        Characteristic.Active,
        active ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
      );
      const level = toNumber(values[def.ventProp]);
      if (level !== undefined && level > 0) {
        service.updateCharacteristic(Characteristic.RotationSpeed, levelToSpeed(level));
      }
    }
  }
}
