import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isLocked } from '../state';

const DOOR_LOCK_PROPS = [
  'doorFrontLeftLocked',
  'doorFrontRightLocked',
  'doorRearLeftLocked',
  'doorRearRightLocked',
];

export class LockAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;
    this.service =
      accessory.getServiceById(Service.LockMechanism, 'rivian-lock') ||
      accessory.addService(Service.LockMechanism, `${vehicle.name} Lock`, 'rivian-lock');

    this.service.getCharacteristic(Characteristic.LockTargetState).onSet(this.setTarget.bind(this));
  }

  private async setTarget(value: CharacteristicValue): Promise<void> {
    const { Characteristic } = this.platform;
    const lock = value === Characteristic.LockTargetState.SECURED;
    await this.platform.sendCommand(this.vehicle, lock ? Command.LOCK_ALL : Command.UNLOCK_ALL);
    // Optimistically reflect the requested state.
    this.service.updateCharacteristic(
      Characteristic.LockCurrentState,
      lock ? Characteristic.LockCurrentState.SECURED : Characteristic.LockCurrentState.UNSECURED,
    );
  }

  update(values: VehicleStateValues): void {
    const { Characteristic } = this.platform;
    const states = DOOR_LOCK_PROPS.map((p) => isLocked(values[p])).filter((s) => s !== undefined);
    if (!states.length) {
      return;
    }
    const allLocked = states.every((s) => s === true);
    const current = allLocked
      ? Characteristic.LockCurrentState.SECURED
      : Characteristic.LockCurrentState.UNSECURED;
    const target = allLocked
      ? Characteristic.LockTargetState.SECURED
      : Characteristic.LockTargetState.UNSECURED;
    this.service.updateCharacteristic(Characteristic.LockCurrentState, current);
    this.service.updateCharacteristic(Characteristic.LockTargetState, target);
  }
}
