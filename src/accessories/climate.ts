import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { Command, VehicleStateValues } from '../commands';
import { isPreconditioning, toNumber } from '../state';

// Rivian cabin preconditioning accepts target temps of 16-29 C (or LO/HI).
const MIN_TEMP_C = 16;
const MAX_TEMP_C = 29;
const DEFAULT_TEMP_C = 21;

/**
 * Cabin preconditioning as a Thermostat tile.
 *
 * Rivian's cloud API does not expose a true live thermostat: it can enable /
 * disable preconditioning and set a target temperature, and the vehicle decides
 * whether to heat or cool to reach it. We therefore map:
 *   - Off  -> disable preconditioning
 *   - Heat / Cool / Auto -> enable preconditioning + set target temperature
 * Current temperature is the reported cabin interior temperature.
 */
export class ClimateAccessory implements RivianAccessory {
  private readonly service: Service;
  private targetTempC = DEFAULT_TEMP_C;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly vehicle: StoredVehicle,
  ) {
    const { Service, Characteristic } = this.platform;

    // Remove the old Switch-based climate service from earlier versions.
    const stale = accessory.getServiceById(Service.Switch, 'rivian-climate');
    if (stale) {
      accessory.removeService(stale);
    }

    this.service =
      accessory.getServiceById(Service.Thermostat, 'rivian-climate') ||
      accessory.addService(Service.Thermostat, `${vehicle.name} Climate`, 'rivian-climate');
    this.service.setCharacteristic(Characteristic.Name, `${vehicle.name} Climate`);
    if (!this.service.testCharacteristic(Characteristic.ConfiguredName)) {
      this.service.addOptionalCharacteristic(Characteristic.ConfiguredName);
    }
    this.service.setCharacteristic(Characteristic.ConfiguredName, `${vehicle.name} Climate`);

    this.service
      .getCharacteristic(Characteristic.TargetTemperature)
      .setProps({ minValue: MIN_TEMP_C, maxValue: MAX_TEMP_C, minStep: 0.5 });
    this.service.setCharacteristic(
      Characteristic.TemperatureDisplayUnits,
      Characteristic.TemperatureDisplayUnits.CELSIUS,
    );

    this.service
      .getCharacteristic(Characteristic.TargetHeatingCoolingState)
      .onSet(this.setMode.bind(this));
    this.service
      .getCharacteristic(Characteristic.TargetTemperature)
      .onSet(this.setTargetTemp.bind(this));
  }

  private async setMode(value: CharacteristicValue): Promise<void> {
    const { Characteristic } = this.platform;
    if (value === Characteristic.TargetHeatingCoolingState.OFF) {
      await this.platform.sendCommand(this.vehicle, Command.PRECONDITION_DISABLE);
      return;
    }
    await this.platform.sendCommand(this.vehicle, Command.PRECONDITION_ENABLE);
    await this.platform.sendCommand(this.vehicle, Command.SET_CABIN_TEMP, {
      HVAC_set_temp: String(this.targetTempC),
    });
  }

  private async setTargetTemp(value: CharacteristicValue): Promise<void> {
    const temp = Math.min(MAX_TEMP_C, Math.max(MIN_TEMP_C, Number(value)));
    this.targetTempC = temp;
    await this.platform.sendCommand(this.vehicle, Command.SET_CABIN_TEMP, {
      HVAC_set_temp: String(temp),
    });
  }

  update(values: VehicleStateValues): void {
    const { Characteristic } = this.platform;

    const interior = toNumber(values.cabinClimateInteriorTemperature);
    if (interior !== undefined) {
      this.service.updateCharacteristic(Characteristic.CurrentTemperature, interior);
    }

    const driverSet = toNumber(values.cabinClimateDriverTemperature);
    if (driverSet !== undefined && driverSet >= MIN_TEMP_C && driverSet <= MAX_TEMP_C) {
      this.targetTempC = driverSet;
      this.service.updateCharacteristic(Characteristic.TargetTemperature, driverSet);
    }

    const on = isPreconditioning(values.cabinPreconditioningStatus);
    if (on === undefined) {
      return;
    }
    if (!on) {
      this.service.updateCharacteristic(
        Characteristic.CurrentHeatingCoolingState,
        Characteristic.CurrentHeatingCoolingState.OFF,
      );
      this.service.updateCharacteristic(
        Characteristic.TargetHeatingCoolingState,
        Characteristic.TargetHeatingCoolingState.OFF,
      );
      return;
    }
    // Preconditioning is on: infer heating vs cooling from interior vs target.
    const cooling = interior !== undefined && interior > this.targetTempC;
    this.service.updateCharacteristic(
      Characteristic.CurrentHeatingCoolingState,
      cooling
        ? Characteristic.CurrentHeatingCoolingState.COOL
        : Characteristic.CurrentHeatingCoolingState.HEAT,
    );
    // Don't clobber an explicit Heat/Cool choice; only promote from Off.
    const currentTarget = this.service.getCharacteristic(Characteristic.TargetHeatingCoolingState).value;
    if (currentTarget === Characteristic.TargetHeatingCoolingState.OFF) {
      this.service.updateCharacteristic(
        Characteristic.TargetHeatingCoolingState,
        Characteristic.TargetHeatingCoolingState.AUTO,
      );
    }
  }
}
