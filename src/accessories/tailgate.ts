import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isOpen } from '../state';

/**
 * Tailgate (R1T) / liftgate (R1S) as a Switch (On = open / drop).
 * Closing only works on vehicles that support a powered liftgate close.
 */
export class TailgateAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;
    this.service =
      accessory.getServiceById(Service.Switch, 'rivian-tailgate') ||
      accessory.addService(Service.Switch, `${vehicle.name} Tailgate`, 'rivian-tailgate');

    this.service.getCharacteristic(Characteristic.On).onSet(this.setOn.bind(this));
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const open = Boolean(value);
    await this.platform.sendCommand(this.vehicle, open ? Command.OPEN_TAILGATE : Command.CLOSE_LIFTGATE);
  }

  update(values: VehicleStateValues): void {
    const open = isOpen(values.closureTailgateClosed ?? values.closureLiftgateClosed);
    if (open !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.On, open);
    }
  }
}
