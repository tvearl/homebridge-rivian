import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isSeatActive } from '../state';
import { nameService } from './util';

const ON_LEVEL = 3;
const OFF_LEVEL = 0;

/** Second-row seat heating as a Switch (both rear seats together). */
export class RearSeatHeatAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;
    this.service =
      accessory.getServiceById(Service.Switch, 'rivian-rear-heat') ||
      accessory.addService(Service.Switch, `${vehicle.name} Rear Seat Heat`, 'rivian-rear-heat');
    nameService(this.platform, this.service, `${vehicle.name} Rear Seat Heat`);

    this.service.getCharacteristic(Characteristic.On).onSet(this.setOn.bind(this));
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const level = value ? ON_LEVEL : OFF_LEVEL;
    await this.platform.sendCommand(this.vehicle, Command.SEAT_REAR_LEFT_HEAT, { level });
    await this.platform.sendCommand(this.vehicle, Command.SEAT_REAR_RIGHT_HEAT, { level });
  }

  update(values: VehicleStateValues): void {
    const states = [values.seatRearLeftHeat, values.seatRearRightHeat]
      .map((v) => isSeatActive(v))
      .filter((s) => s !== undefined);
    if (!states.length) {
      return;
    }
    this.service.updateCharacteristic(this.platform.Characteristic.On, states.some((s) => s === true));
  }
}
