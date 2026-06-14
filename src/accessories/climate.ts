import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isPreconditioning } from '../state';
import { nameService } from './util';

/**
 * Cabin preconditioning as a simple Switch. State is best-effort: Rivian's
 * cloud API does not expose a full live thermostat, so this enables/disables
 * preconditioning and reflects the reported preconditioning status.
 */
export class ClimateAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;
    this.service =
      accessory.getServiceById(Service.Switch, 'rivian-climate') ||
      accessory.addService(Service.Switch, `${vehicle.name} Preconditioning`, 'rivian-climate');
    nameService(this.platform, this.service, `${vehicle.name} Preconditioning`);

    this.service.getCharacteristic(Characteristic.On).onSet(this.setOn.bind(this));
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const on = Boolean(value);
    await this.platform.sendCommand(
      this.vehicle,
      on ? Command.PRECONDITION_ENABLE : Command.PRECONDITION_DISABLE,
    );
  }

  update(values: VehicleStateValues): void {
    const reported = isPreconditioning(values.cabinPreconditioningStatus);
    if (reported !== undefined) {
      this.service.updateCharacteristic(this.platform.Characteristic.On, reported);
    }
  }
}
