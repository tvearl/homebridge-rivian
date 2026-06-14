import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isOpen } from '../state';
import { nameService } from './util';

/** Front trunk as a Switch (On = open). */
export class FrunkAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;
    this.service =
      accessory.getServiceById(Service.Switch, 'rivian-frunk') ||
      accessory.addService(Service.Switch, `${vehicle.name} Frunk`, 'rivian-frunk');
    nameService(this.platform, this.service, `${vehicle.name} Frunk`);

    this.service.getCharacteristic(Characteristic.On).onSet(this.setOn.bind(this));
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const open = Boolean(value);
    await this.platform.sendCommand(this.vehicle, open ? Command.OPEN_FRUNK : Command.CLOSE_FRUNK);
  }

  update(values: VehicleStateValues): void {
    const open = isOpen(values.closureFrunkClosed);
    if (open !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.On, open);
    }
  }
}
