import type { VehicleStateValues } from './commands';

/** Flatten the raw `{ prop: { timeStamp, value } }` response to `{ prop: value }`. */
export function flattenState(
  raw: Record<string, { timeStamp: string; value: any } | null>,
): VehicleStateValues {
  const out: VehicleStateValues = {};
  for (const [key, entry] of Object.entries(raw)) {
    out[key] = entry ? entry.value : undefined;
  }
  return out;
}

const LOCKED_VALUES = new Set(['locked', 'lock', 'true']);
const CLOSED_VALUES = new Set(['closed', 'close', 'latched', 'true']);
const OPEN_VALUES = new Set(['open', 'opened', 'unlatched', 'ajar']);

export function isLocked(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return LOCKED_VALUES.has(String(value).toLowerCase());
}

/** Returns true when a closure is open, false when closed, undefined when unknown. */
export function isOpen(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const v = String(value).toLowerCase();
  if (OPEN_VALUES.has(v)) {
    return true;
  }
  if (CLOSED_VALUES.has(v)) {
    return false;
  }
  return undefined;
}

const PRECONDITION_ON = new Set([
  'on',
  'enabled',
  'active',
  'running',
  'preconditioning',
  'precondition_enabled',
  'on_demand',
  'ondemand',
]);

export function isPreconditioning(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const v = String(value).toLowerCase();
  if (PRECONDITION_ON.has(v)) {
    return true;
  }
  if (['off', 'unconfigured', 'undefined', 'disabled', 'inactive', 'none'].includes(v)) {
    return false;
  }
  // Unknown enum value: treat anything other than the known "off" set as off
  // to avoid false "on" reports.
  return false;
}

/**
 * Determine whether the vehicle is actively charging.
 *
 * Rivian's `chargerStatus` is the reliable signal: it reads
 * `chrgr_sts_connected_charging` while charging, vs `chrgr_sts_not_connected`
 * or `chrgr_sts_connected_no_chrg` otherwise. `chargerState` is NOT reliable
 * for this because it uses values like `charging_ready` (plugged-in-ready, not
 * actually charging), so a naive substring match would false-positive.
 */
export function isCharging(chargerStatus: unknown, chargerState: unknown): boolean {
  const status = chargerStatus !== undefined && chargerStatus !== null ? String(chargerStatus).toLowerCase() : '';
  const state = chargerState !== undefined && chargerState !== null ? String(chargerState).toLowerCase() : '';
  if (status) {
    return status.includes('charging');
  }
  return ['charging_active', 'charging_active_ac', 'charging_active_dc'].includes(state);
}

export function toNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

const SEAT_OFF_VALUES = new Set(['0', 'off', 'undefined', 'unconfigured', 'none', 'level_0', 'false']);

/** Seat heat/vent reports either a level (0-4) or a string; treat anything that
 * isn't an explicit "off" as active. */
export function isSeatActive(value: unknown): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return !SEAT_OFF_VALUES.has(String(value).toLowerCase());
}
