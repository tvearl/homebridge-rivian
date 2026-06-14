import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isOpen } from '../state';

const WINDOW_PROPS = [
  'windowFrontLeftClosed',
  'windowFrontRightClosed',
  'windowRearLeftClosed',
  'windowRearRightClosed',
];

/**
 * Open/close all windows as a Switch (On = open). Rivian's cloud API only
 * supports opening/closing all windows together - there is no partial "vent".
 */
export class WindowsAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;
    this.service =
      accessory.getServiceById(Service.Switch, 'rivian-windows') ||
      accessory.addService(Service.Switch, `${vehicle.name} Windows`, 'rivian-windows');

    this.service.getCharacteristic(Characteristic.On).onSet(this.setOn.bind(this));
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const open = Boolean(value);
    await this.platform.sendCommand(this.vehicle, open ? Command.OPEN_WINDOWS : Command.CLOSE_WINDOWS);
  }

  update(values: VehicleStateValues): void {
    const states = WINDOW_PROPS.map((p) => isOpen(values[p])).filter((s) => s !== undefined);
    if (!states.length) {
      return;
    }
    const anyOpen = states.some((s) => s === true);
    this.service.updateCharacteristic(this.platform.Characteristic.On, anyOpen);
  }
}
