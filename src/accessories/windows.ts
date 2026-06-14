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
 * All windows as a Window tile (slider). Rivian's cloud API only supports
 * opening/closing ALL windows together and only reports open/closed (no
 * per-window control, no partial/vent position), so the slider snaps:
 * >= 50% opens all windows, < 50% closes all. Position reflects open/closed.
 */
export class WindowsAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;

    // Remove the old Switch-based service from earlier versions, if present.
    const stale = accessory.getServiceById(Service.Switch, 'rivian-windows');
    if (stale) {
      accessory.removeService(stale);
    }

    this.service =
      accessory.getServiceById(Service.Window, 'rivian-windows') ||
      accessory.addService(Service.Window, `${vehicle.name} Windows`, 'rivian-windows');
    nameService(this.platform, this.service, `${vehicle.name} Windows`);
    this.service.setCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);

    this.service.getCharacteristic(Characteristic.TargetPosition).onSet(this.setTarget.bind(this));
  }

  private async setTarget(value: CharacteristicValue): Promise<void> {
    const { Characteristic } = this.platform;
    const open = Number(value) >= 50;
    await this.platform.sendCommand(this.vehicle, open ? Command.OPEN_WINDOWS : Command.CLOSE_WINDOWS);

    const snapped = open ? 100 : 0;
    this.service.updateCharacteristic(Characteristic.TargetPosition, snapped);
    this.service.updateCharacteristic(
      Characteristic.PositionState,
      open ? Characteristic.PositionState.INCREASING : Characteristic.PositionState.DECREASING,
    );
    // Settle the slider; the state poll will reconcile with reality.
    setTimeout(() => {
      this.service.updateCharacteristic(Characteristic.CurrentPosition, snapped);
      this.service.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
    }, 1500);
  }

  update(values: VehicleStateValues): void {
    const { Characteristic } = this.platform;
    const states = WINDOW_PROPS.map((p) => isOpen(values[p])).filter((s) => s !== undefined);
    if (!states.length) {
      return;
    }
    const position = states.some((s) => s === true) ? 100 : 0;
    this.service.updateCharacteristic(Characteristic.CurrentPosition, position);
    this.service.updateCharacteristic(Characteristic.TargetPosition, position);
    this.service.updateCharacteristic(Characteristic.PositionState, Characteristic.PositionState.STOPPED);
  }
}
