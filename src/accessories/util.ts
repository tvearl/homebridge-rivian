import type { Service } from 'homebridge';
import type { RivianHomebridgePlatform } from '../platform';

/**
 * Give a service a stable, human-readable name in the Home app.
 *
 * When several services of the same type (e.g. multiple Switches) live on one
 * accessory, Apple Home ignores the plain `Name` and falls back to labels like
 * "Switch 1", "Switch 2". Adding the `ConfiguredName` characteristic makes Home
 * display (and let the user rename) each service properly.
 */
export function nameService(platform: RivianHomebridgePlatform, service: Service, name: string): void {
  const { Characteristic } = platform;
  service.setCharacteristic(Characteristic.Name, name);
  if (!service.testCharacteristic(Characteristic.ConfiguredName)) {
    service.addOptionalCharacteristic(Characteristic.ConfiguredName);
  }
  service.setCharacteristic(Characteristic.ConfiguredName, name);
}
