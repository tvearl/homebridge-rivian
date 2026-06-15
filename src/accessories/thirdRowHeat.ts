import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isSeatActive } from '../state';
import { nameService } from './util';

const ON_LEVEL = 3;
const OFF_LEVEL = 0;

/**
 * Third-row seat heating (R1S) as a Switch. Turns both third-row seats on/off.
 * Uses the Gen2 HVAC third-row commands; has no effect on vehicles without a
 * heated third row.
 */
export class ThirdRowHeatAccessory implements RivianAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;
    this.service =
      accessory.getServiceById(Service.Switch, 'rivian-thirdrow-heat') ||
      accessory.addService(Service.Switch, `${vehicle.name} Third Row Heat`, 'rivian-thirdrow-heat');
    nameService(this.platform, this.service, `${vehicle.name} Third Row Heat`);

    this.service.getCharacteristic(Characteristic.On).onSet(this.setOn.bind(this));
  }

  private async setOn(value: CharacteristicValue): Promise<void> {
    const level = value ? ON_LEVEL : OFF_LEVEL;
    await this.platform.sendCommand(this.vehicle, Command.SEAT_THIRD_ROW_LEFT_HEAT, { level });
    await this.platform.sendCommand(this.vehicle, Command.SEAT_THIRD_ROW_RIGHT_HEAT, { level });
  }

  update(values: VehicleStateValues): void {
    const states = [values.seatThirdRowLeftHeat, values.seatThirdRowRightHeat]
      .map((v) => isSeatActive(v))
      .filter((s) => s !== undefined);
    if (!states.length) {
      return;
    }
    this.service.updateCharacteristic(this.platform.Characteristic.On, states.some((s) => s === true));
  }
}
