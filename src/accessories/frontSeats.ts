import type { PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isSeatActive, toNumber } from '../state';
import { nameService } from './util';

const ON_LEVEL = 3;
const OFF_LEVEL = 0;

interface SeatDef {
  subtype: string;
  name: string;
  heatCmd: string;
  ventCmd: string;
  heatProp: string;
  ventProp: string;
}

/**
 * Front seats as Heater/Cooler tiles (Driver + Passenger). Each tile is a
 * single on/off control that switches between Heat and Cool, mapping to
 * Rivian's per-seat heat and vent commands. The temperature shown mirrors the
 * cabin interior temp (seats have no setpoint of their own).
 */
export class FrontSeatsAccessory implements RivianAccessory {
  private readonly seats: { def: SeatDef; service: Service }[] = [];

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
      service.updateCharacteristic(Characteristic.CurrentTemperature, 21);

      service.getCharacteristic(Characteristic.Active).onSet(() => this.apply(def, service));
      service.getCharacteristic(Characteristic.TargetHeaterCoolerState).onSet(() => this.apply(def, service));
      this.seats.push({ def, service });
    }
  }

  private async apply(def: SeatDef, service: Service): Promise<void> {
    const { Characteristic } = this.platform;
    const active = service.getCharacteristic(Characteristic.Active).value === Characteristic.Active.ACTIVE;
    const mode = service.getCharacteristic(Characteristic.TargetHeaterCoolerState).value;
    const heat = active && mode === Characteristic.TargetHeaterCoolerState.HEAT;
    const cool = active && mode === Characteristic.TargetHeaterCoolerState.COOL;

    await this.platform.sendCommand(this.vehicle, def.heatCmd, { level: heat ? ON_LEVEL : OFF_LEVEL });
    await this.platform.sendCommand(this.vehicle, def.ventCmd, { level: cool ? ON_LEVEL : OFF_LEVEL });

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
    for (const { def, service } of this.seats) {
      if (temp !== undefined) {
        service.updateCharacteristic(Characteristic.CurrentTemperature, temp);
      }
      const heat = isSeatActive(values[def.heatProp]) === true;
      const cool = isSeatActive(values[def.ventProp]) === true;
      service.updateCharacteristic(
        Characteristic.Active,
        heat || cool ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE,
      );
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
