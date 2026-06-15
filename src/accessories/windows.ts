import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isOpen } from '../state';
import { nameService } from './util';

const WINDOW_PROPS = [
  'windowFrontLeftClosed',
  'windowFrontRightClosed',
  'windowRearLeftClosed',
  'windowRearRightClosed',
];

/**
 * Vent (open) / close all windows as a Switch. Rivian's cloud API only supports
 * opening/closing ALL windows together (no per-window control, no partial vent
 * position), so this is a single on (vented/open) / off (closed) switch.
 */
export class WindowsAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;

    // Remove the Window-slider service from 1.0.4, if present.
    const staleWindow = accessory.getServiceById(Service.Window, 'rivian-windows');
    if (staleWindow) {
      accessory.removeService(staleWindow);
    }

    this.service =
      accessory.getServiceById(Service.Switch, 'rivian-windows') ||
      accessory.addService(Service.Switch, `${vehicle.name} Vent Windows`, 'rivian-windows');
    nameService(this.platform, this.service, `${vehicle.name} Vent Windows`);

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
