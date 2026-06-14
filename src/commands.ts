/** Vehicle commands used by this plugin (subset of Rivian's command set). */
export const Command = {
  WAKE_VEHICLE: 'WAKE_VEHICLE',
  LOCK_ALL: 'LOCK_ALL_CLOSURES_FEEDBACK',
  UNLOCK_ALL: 'UNLOCK_ALL_CLOSURES',
  PRECONDITION_ENABLE: 'VEHICLE_CABIN_PRECONDITION_ENABLE',
  PRECONDITION_DISABLE: 'VEHICLE_CABIN_PRECONDITION_DISABLE',
  SET_CABIN_TEMP: 'CABIN_PRECONDITIONING_SET_TEMP',
  SEAT_FRONT_LEFT_VENT: 'CABIN_HVAC_LEFT_SEAT_VENT',
  SEAT_FRONT_RIGHT_VENT: 'CABIN_HVAC_RIGHT_SEAT_VENT',
  OPEN_WINDOWS: 'OPEN_ALL_WINDOWS',
  CLOSE_WINDOWS: 'CLOSE_ALL_WINDOWS',
  OPEN_FRUNK: 'OPEN_FRUNK',
  CLOSE_FRUNK: 'CLOSE_FRUNK',
  OPEN_TAILGATE: 'OPEN_LIFTGATE_UNLATCH_TAILGATE',
  CLOSE_LIFTGATE: 'CLOSE_LIFTGATE',
  OPEN_TONNEAU: 'OPEN_TONNEAU_COVER',
  CLOSE_TONNEAU: 'CLOSE_TONNEAU_COVER',
} as const;

export type CommandName = (typeof Command)[keyof typeof Command];

/**
 * Vehicle-state properties the plugin polls. Each resolves to `{ timeStamp, value }`.
 */
export const STATE_PROPERTIES: string[] = [
  // battery / charging
  'batteryLevel',
  'batteryLimit',
  'distanceToEmpty',
  'chargerState',
  'chargerStatus',
  'timeToEndOfCharge',
  // locks / doors
  'doorFrontLeftLocked',
  'doorFrontRightLocked',
  'doorRearLeftLocked',
  'doorRearRightLocked',
  // climate
  'cabinPreconditioningStatus',
  'cabinPreconditioningType',
  'cabinClimateInteriorTemperature',
  'cabinClimateDriverTemperature',
  'seatFrontLeftVent',
  'seatFrontRightVent',
  // windows
  'windowFrontLeftClosed',
  'windowFrontRightClosed',
  'windowRearLeftClosed',
  'windowRearRightClosed',
  // frunk
  'closureFrunkClosed',
  // tailgate / liftgate
  'closureTailgateClosed',
  'closureLiftgateClosed',
  // tonneau
  'closureTonneauClosed',
  // power
  'powerState',
];

/** A snapshot of parsed vehicle state keyed by property name -> raw value. */
export type VehicleStateValues = Record<string, any>;
