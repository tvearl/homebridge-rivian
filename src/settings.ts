/**
 * Platform name registered with Homebridge. Must match `pluginAlias` in config.schema.json.
 */
export const PLATFORM_NAME = 'RivianHomebridge';

/**
 * npm package name. Must match the `name` field in package.json.
 */
export const PLUGIN_NAME = 'homebridge-rivian';

/**
 * File (inside the Homebridge storage path) that holds session tokens, the
 * locally generated phone key, and per-vehicle enrollment identifiers.
 */
export const AUTH_FILE_NAME = 'rivian-auth.json';

/**
 * Default name shown for the enrolled key in the Rivian app. Counts against
 * the account's 2 phone-key limit.
 */
export const DEFAULT_DEVICE_NAME = 'Homebridge';
