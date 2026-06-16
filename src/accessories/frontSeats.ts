import type { PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isSeatActive, toNumber } from '../state';
import { nameService } from './util';

// Rivian seat levels: 0 = off, 2 = low, 3 = medium, 4 = high (1 is "on"/auto).
// We expose 3 fan speeds mapped to low/medium/high.
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
  heatCmd: string;
  ventCmd: string;
  heatProp: string;
  ventProp: string;
}

/**
 * Front seats as Heater/Cooler tiles (Driver + Passenger). Each tile is an
 * on/off control with a Heat/Cool selector and a 3-position fan-speed slider
 * (speed 1/2/3 -> Rivian seat levels low/medium/high), mapping to the per-seat
 * heat and vent commands.
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

    // Remove the old single "Seat Cooling" switch from earlier versions.
    const staleCool = accessory.getServiceById(Service.Switch, 'rivian-seat-cooling');
    if (staleCool) {
      accessory.removeService(staleCool);
    }

    const defs: SeatDef[] = [
      {
        subtype: 'rivian-seat-driver',
        name: `${vehicle.name} Driver Seat`,
        heatCmd: Command.SEAT_FRONT_LEFT_HEAT,
        ventCmd: Command.SEAT_FRONT_LEFT_VENT,
        heatProp: 'seatFrontLeftHeat',
        ventProp: 'seatFrontLeftVent',
      },
      {
        subtype: 'rivian-seat-passenger',
        name: `${vehicle.name} Passenger Seat`,
        heatCmd: Command.SEAT_FRONT_RIGHT_HEAT,
        ventCmd: Command.SEAT_FRONT_RIGHT_VENT,
        heatProp: 'seatFrontRightHeat',
        ventProp: 'seatFrontRightVent',
      },
    ];

    for (const def of defs) {
      const service =
        accessory.getServiceById(Service.HeaterCooler, def.subtype) ||
        accessory.addService(Service.HeaterCooler, def.name, def.subtype);
      nameService(this.platform, service, def.name);
      service
        .getCharacteristic(Characteristic.TargetHeaterCoolerState)
        .setProps({
          validValues: [
            Characteristic.TargetHeaterCoolerState.HEAT,
            Characteristic.TargetHeaterCoolerState.COOL,
          ],
        });
      // 3-position speed slider (low / medium / high).
      service.getCharacteristic(Characteristic.RotationSpeed).setProps({ minValue: 0, maxValue: 100, minStep: STEP });
      service.updateCharacteristic(Characteristic.CurrentTemperature, 21);

      service.getCharacteristic(Characteristic.Active).onSet(() => this.apply(def, service));
      service.getCharacteristic(Characteristic.TargetHeaterCoolerState).onSet(() => this.apply(def, service));
      service.getCharacteristic(Characteristic.RotationSpeed).onSet(() => this.apply(def, service));
      this.seats.push({ def, service });
    }
  }

  private async apply(def: SeatDef, service: Service): Promise<void> {
    const { Characteristic } = this.platform;
    this.lastCommandAt = Date.now();

    const active = service.getCharacteristic(Characteristic.Active).value === Characteristic.Active.ACTIVE;
    const mode = service.getCharacteristic(Characteristic.TargetHeaterCoolerState).value;
    let speed = Number(service.getCharacteristic(Characteristic.RotationSpeed).value) || 0;

    let level = active ? speedToLevel(speed) : 0;
    if (active && level === 0) {
      // Turned on without a speed selected - default to medium.
      level = DEFAULT_LEVEL;
      speed = levelToSpeed(level);
      service.updateCharacteristic(Characteristic.RotationSpeed, speed);
    }

    const heat = active && mode === Characteristic.TargetHeaterCoolerState.HEAT;
    const cool = active && mode === Characteristic.TargetHeaterCoolerState.COOL;

    await this.platform.sendCommand(this.vehicle, def.heatCmd, { level: heat ? level : 0 });
    await this.platform.sendCommand(this.vehicle, def.ventCmd, { level: cool ? level : 0 });

    service.updateCharacteristic(
      Characteristic.CurrentHeaterCoolerState,
      heat
        ? Characteristic.CurrentHeaterCoolerState.HEATING
        : cool
          ? Characteristic.CurrentHeaterCoolerState.COOLING
          : Characteristic.CurrentHeaterCoolerState.INACTIVE,
    );
  }

  update(values: VehicleStateValues): void {
    const { Characteristic } = this.platform;
    const temp = toNumber(values.cabinClimateInteriorTemperature);

    for (const { service } of this.seats) {
      if (temp !== undefined) {
        service.updateCharacteristic(Characteristic.CurrentTemperature, temp);
      }
    }

    // Don't let a lagging state poll override a recent user action.
    if (Date.now() - this.lastCommandAt < COMMAND_GRACE_MS) {
      return;
    }

    for (const { def, service } of this.seats) {
      const heatActive = isSeatActive(values[def.heatProp]);
      const ventActive = isSeatActive(values[def.ventProp]);
      if (heatActive === undefined && ventActive === undefined) {
        continue;
      }
      const heat = heatActive === true;
      const cool = ventActive === true;
      service.updateCharacteristic(
        Characteristic.Active,
        heat || cool ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
      );

      const reportedLevel = heat
        ? toNumber(values[def.heatProp])
        : cool
          ? toNumber(values[def.ventProp])
          : undefined;
      if (reportedLevel !== undefined && reportedLevel > 0) {
        service.updateCharacteristic(Characteristic.RotationSpeed, levelToSpeed(reportedLevel));
      }

      if (heat) {
        service.updateCharacteristic(
          Characteristic.TargetHeaterCoolerState,
          Characteristic.TargetHeaterCoolerState.HEAT,
        );
      } else if (cool) {
        service.updateCharacteristic(
          Characteristic.TargetHeaterCoolerState,
          Characteristic.TargetHeaterCoolerState.COOL,
        );
      }
      service.updateCharacteristic(
        Characteristic.CurrentHeaterCoolerState,
        heat
          ? Characteristic.CurrentHeaterCoolerState.HEATING
          : cool
            ? Characteristic.CurrentHeaterCoolerState.COOLING
            : Characteristic.CurrentHeaterCoolerState.INACTIVE,
      );
    }
  }
}
