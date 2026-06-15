import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isSeatActive } from '../state';
import { nameService } from './util';

const ON_LEVEL = 3;
const OFF_LEVEL = 0;

/** Heated steering wheel as a Switch. */
export class SteeringHeatAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;
    this.service =
      accessory.getServiceById(Service.Switch, 'rivian-steering-heat') ||
      accessory.addService(Service.Switch, `${vehicle.name} Steering Wheel Heat`, 'rivian-steering-heat');
    nameService(this.platform, this.service, `${vehicle.name} Steering Wheel Heat`);

    this.service.getCharacteristic(Characteristic.On).onSet(this.setOn.bind(this));
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    await this.platform.sendCommand(this.vehicle, Command.STEERING_HEAT, { level: value ? ON_LEVEL : OFF_LEVEL });
  }

  update(values: VehicleStateValues): void {
    const active = isSeatActive(values.steeringWheelHeat);
    if (active !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.On, active);
    }
  }
}
