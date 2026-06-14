import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isSeatActive } from '../state';
import { nameService } from './util';

// Seat vent/heat level: 0 = off, 1-4 = increasing. Use a mid level for "on".
const ON_LEVEL = 3;
const OFF_LEVEL = 0;

/**
 * Front-seat cooling (ventilation) as a Switch. Turning it on vents both front
 * seats; useful to fire alongside cabin preconditioning. Heating uses different
 * commands and is intentionally not bundled here.
 */
export class SeatCoolingAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;
    this.service =
      accessory.getServiceById(Service.Switch, 'rivian-seat-cooling') ||
      accessory.addService(Service.Switch, `${vehicle.name} Seat Cooling`, 'rivian-seat-cooling');
    nameService(this.platform, this.service, `${vehicle.name} Seat Cooling`);

    this.service.getCharacteristic(Characteristic.On).onSet(this.setOn.bind(this));
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const level = value ? ON_LEVEL : OFF_LEVEL;
    await this.platform.sendCommand(this.vehicle, Command.SEAT_FRONT_LEFT_VENT, { level });
    await this.platform.sendCommand(this.vehicle, Command.SEAT_FRONT_RIGHT_VENT, { level });
  }

  update(values: VehicleStateValues): void {
    const states = [values.seatFrontLeftVent, values.seatFrontRightVent]
      .map((v) => isSeatActive(v))
      .filter((s) => s !== undefined);
    if (!states.length) {
      return;
    }
    this.service.updateCharacteristic(this.platform.Characteristic.On, states.some((s) => s === true));
  }
}
