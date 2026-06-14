import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isOpen } from '../state';

/**
 * Powered tonneau cover (R1T with the powered tonneau accessory) as a Switch
 * (On = open). Has no effect on vehicles without a powered tonneau.
 */
export class TonneauAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;
    this.service =
      accessory.getServiceById(Service.Switch, 'rivian-tonneau') ||
      accessory.addService(Service.Switch, `${vehicle.name} Tonneau`, 'rivian-tonneau');

    this.service.getCharacteristic(Characteristic.On).onSet(this.setOn.bind(this));
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const open = Boolean(value);
    await this.platform.sendCommand(this.vehicle, open ? Command.OPEN_TONNEAU : Command.CLOSE_TONNEAU);
  }

  update(values: VehicleStateValues): void {
    const open = isOpen(values.closureTonneauClosed);
    if (open !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.On, open);
    }
  }
}
