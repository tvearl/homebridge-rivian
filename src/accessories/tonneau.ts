import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isOpen } from '../state';
import { nameService } from './util';

/**
 * Powered tonneau cover (R1T with the powered tonneau) as a Garage Door tile
 * so the Home app shows a clear Open / Closed state. Has no effect on vehicles
 * without a powered tonneau.
 */
export class TonneauAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;

    // Remove the old Switch-based service from earlier versions, if present.
    const stale = accessory.getServiceById(Service.Switch, 'rivian-tonneau');
    if (stale) {
      accessory.removeService(stale);
    }

    this.service =
      accessory.getServiceById(Service.GarageDoorOpener, 'rivian-tonneau') ||
      accessory.addService(Service.GarageDoorOpener, `${vehicle.name} Tonneau`, 'rivian-tonneau');
    nameService(this.platform, this.service, `${vehicle.name} Tonneau`);
    this.service.setCharacteristic(Characteristic.ObstructionDetected, false);

    this.service.getCharacteristic(Characteristic.TargetDoorState).onSet(this.setTarget.bind(this));
  }

  private async setTarget(value: CharacteristicValue): Promise<void> {
    const { Characteristic } = this.platform;
    const open = value === Characteristic.TargetDoorState.OPEN;
    await this.platform.sendCommand(this.vehicle, open ? Command.OPEN_TONNEAU : Command.CLOSE_TONNEAU);
    this.service.updateCharacteristic(
      Characteristic.CurrentDoorState,
      open ? Characteristic.CurrentDoorState.OPENING : Characteristic.CurrentDoorState.CLOSING,
    );
  }

  update(values: VehicleStateValues): void {
    const { Characteristic } = this.platform;
    const open = isOpen(values.closureTonneauClosed);
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
