import type { PlatformAccessory, Service } from 'homebridge';
import type { RivianHomebridgePlatform, RivianAccessory } from '../platform';
import type { StoredVehicle } from '../persist';
import { VehicleStateValues } from '../commands';
import { isCharging, toNumber } from '../state';
import { nameService } from './util';

const LOW_BATTERY_THRESHOLD = 20;

/**
 * Exposes state of charge as a Humidity sensor (so it shows a readable %),
 * a Battery service (level + charging + low-battery), and a Contact sensor
 * that "opens" while charging.
 */
export class BatteryAccessory implements RivianAccessory {
  private readonly humidity: Service;
  private readonly battery: Service;
  private readonly charging: Service;

  constructor(
    private readonly platform: RivianHomebridgePlatform,
    accessory: PlatformAccessory,
    vehicle: StoredVehicle,
  ) {
    const { Service } = this.platform;

    this.humidity =
      accessory.getServiceById(Service.HumiditySensor, 'rivian-soc') ||
      accessory.addService(Service.HumiditySensor, `${vehicle.name} Battery`, 'rivian-soc');

    this.battery =
      accessory.getServiceById(Service.Battery, 'rivian-battery') ||
      accessory.addService(Service.Battery, `${vehicle.name} Battery Level`, 'rivian-battery');

    this.charging =
      accessory.getServiceById(Service.ContactSensor, 'rivian-charging') ||
      accessory.addService(Service.ContactSensor, `${vehicle.name} Charging`, 'rivian-charging');

    nameService(this.platform, this.humidity, `${vehicle.name} Battery`);
    nameService(this.platform, this.battery, `${vehicle.name} Battery Level`);
    nameService(this.platform, this.charging, `${vehicle.name} Charging`);
  }

  update(values: VehicleStateValues): void {
    const { Characteristic } = this.platform;
    const soc = toNumber(values.batteryLevel);
    const charging = isCharging(values.chargerStatus, values.chargerState);

    if (soc !== undefined) {
      const clamped = Math.max(0, Math.min(100, Math.round(soc)));
      this.humidity.updateCharacteristic(Characteristic.CurrentRelativeHumidity, clamped);
      this.battery.updateCharacteristic(Characteristic.BatteryLevel, clamped);
      this.battery.updateCharacteristic(
        Characteristic.StatusLowBattery,
        clamped <= LOW_BATTERY_THRESHOLD
          ? Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW
          : Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL,
      );
    }

    this.battery.updateCharacteristic(
      Characteristic.ChargingState,
      charging ? Characteristic.ChargingState.CHARGING : Characteristic.ChargingState.NOT_CHARGING,
    );

    this.charging.updateCharacteristic(
      Characteristic.ContactSensorState,
      charging
        ? Characteristic.ContactSensorState.CONTACT_NOT_DETECTED
        : Characteristic.ContactSensorState.CONTACT_DETECTED,
    );
  }
}
