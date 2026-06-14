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

const CHARGING_VALUES = new Set(['charging', 'charging_active', 'active', 'charging_ac', 'charging_dc']);

export function isCharging(chargerStatus: unknown, chargerState: unknown): boolean {
  const a = chargerStatus !== undefined && chargerStatus !== null ? String(chargerStatus).toLowerCase() : '';
  const b = chargerState !== undefined && chargerState !== null ? String(chargerState).toLowerCase() : '';
  return CHARGING_VALUES.has(a) || CHARGING_VALUES.has(b) || a.includes('charging') || b.includes('charging');
}

export function toNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
