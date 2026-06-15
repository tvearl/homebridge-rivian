import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isOpen } from '../state';
import { nameService } from './util';

/**
 * R1T gear tunnel access (the two side-bin doors), as two Switches.
 *
 * The API can only *release* (open) a side bin - there is no close command (you
 * push the door shut by hand). So turning a switch on opens that side; the
 * switch otherwise reflects the door's actual open/closed state from polling.
 */
export class GearTunnelAccessory implements RivianAccessory {
  private readonly left: Service;
  private readonly right: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;

    this.left =
      accessory.getServiceById(Service.Switch, 'rivian-gear-left') ||
      accessory.addService(Service.Switch, `${vehicle.name} Gear Tunnel Left`, 'rivian-gear-left');
    this.right =
      accessory.getServiceById(Service.Switch, 'rivian-gear-right') ||
      accessory.addService(Service.Switch, `${vehicle.name} Gear Tunnel Right`, 'rivian-gear-right');
    nameService(this.platform, this.left, `${vehicle.name} Gear Tunnel Left`);
    nameService(this.platform, this.right, `${vehicle.name} Gear Tunnel Right`);

    this.left.getCharacteristic(Characteristic.On).onSet((v) => this.release(Command.RELEASE_LEFT_SIDE_BIN, v));
    this.right.getCharacteristic(Characteristic.On).onSet((v) => this.release(Command.RELEASE_RIGHT_SIDE_BIN, v));
  }

  private async release(command: string, value: CharacteristicValue): Promise<void> {
    // Only "open" is supported; closing is manual, so off is a no-op (the next
    // state poll keeps the switch in sync with the actual door).
    if (value) {
      await this.platform.sendCommand(this.vehicle, command);
    }
  }

  update(values: VehicleStateValues): void {
    const { Characteristic } = this.platform;
    const l = isOpen(values.closureSideBinLeftClosed);
    if (l !== undefined) {
      this.left.updateCharacteristic(Characteristic.On, l);
    }
    const r = isOpen(values.closureSideBinRightClosed);
    if (r !== undefined) {
      this.right.updateCharacteristic(Characteristic.On, r);
    }
  }
}
