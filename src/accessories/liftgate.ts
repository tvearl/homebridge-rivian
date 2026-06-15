import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isOpen } from '../state';
import { nameService } from './util';

/**
 * Rear trunk / powered liftgate for the R1S, as a Garage Door tile
 * (open + close with Open/Closed state). The R1T uses the tailgate accessory
 * instead (a drop tailgate that the API can't close or report position for).
 */
export class LiftgateAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;

    // Remove a tailgate Switch if this vehicle was previously treated as an R1T.
    const staleTailgate = accessory.getServiceById(Service.Switch, 'rivian-tailgate');
    if (staleTailgate) {
      accessory.removeService(staleTailgate);
    }

    this.service =
      accessory.getServiceById(Service.GarageDoorOpener, 'rivian-liftgate') ||
      accessory.addService(Service.GarageDoorOpener, `${vehicle.name} Trunk`, 'rivian-liftgate');
    nameService(this.platform, this.service, `${vehicle.name} Trunk`);
    this.service.setCharacteristic(Characteristic.ObstructionDetected, false);

    this.service.getCharacteristic(Characteristic.TargetDoorState).onSet(this.setTarget.bind(this));
  }

  private async setTarget(value: CharacteristicValue): Promise<void> {
    const { Characteristic } = this.platform;
    const open = value === Characteristic.TargetDoorState.OPEN;
    await this.platform.sendCommand(this.vehicle, open ? Command.OPEN_TAILGATE : Command.CLOSE_LIFTGATE);
    this.service.updateCharacteristic(
      Characteristic.CurrentDoorState,
      open ? Characteristic.CurrentDoorState.OPENING : Characteristic.CurrentDoorState.CLOSING,
    );
  }

  update(values: VehicleStateValues): void {
    const { Characteristic } = this.platform;
    const open = isOpen(values.closureLiftgateClosed);
    if (open === undefined) {
      return;
    }
    this.service.updateCharacteristic(
      Characteristic.CurrentDoorState,
      open ? Characteristic.CurrentDoorState.OPEN : Characteristic.CurrentDoorState.CLOSED,
    );
    this.service.updateCharacteristic(
      Characteristic.TargetDoorState,
      open ? Characteristic.TargetDoorState.OPEN : Characteristic.TargetDoorState.CLOSED,
    );
  }
}
