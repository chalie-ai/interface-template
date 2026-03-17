/**
 * Chalie Interface Constants
 *
 * Import this file to get fully-typed constants for every scope, context field,
 * and discrete value the gateway can return.
 *
 * Everything lives under the `CONSTANTS` namespace. Your editor will
 * autocomplete every scope key, field, and enum value.
 *
 * @example
 * ```ts
 * import { CONSTANTS } from "./constants.ts";
 *
 * // Declare scopes — no magic strings
 * const SCOPES = {
 *   context: {
 *     [CONSTANTS.SCOPES.LOCATION]: "Required for weather at your current city",
 *     [CONSTANTS.SCOPES.ENERGY]:   "Adjusts notification frequency based on your energy",
 *   },
 * };
 *
 * // Read context — fully typed, no casting
 * const ctx = await getContext();
 * const location = ctx.get(CONSTANTS.SCOPES.LOCATION);
 * // ^ LocationContext | undefined
 * // location.lat, location.lon, location.name — all autocompleted
 *
 * const attention = ctx.get(CONSTANTS.SCOPES.ATTENTION);
 * // ^ AttentionState | undefined — "focused" | "ambient" | "distracted"
 *
 * if (attention === CONSTANTS.ATTENTION.FOCUSED) {
 *   // user is in deep focus — skip the message
 * }
 * ```
 *
 * @module
 */

// =============================================================================
// Context Field Types
// =============================================================================

/**
 * City-level location returned when `CONSTANTS.SCOPES.LOCATION` is approved.
 *
 * Coordinates are snapped to a geohash cell (~1 km radius). Raw GPS is never
 * exposed. The `name` field is a human-readable label suitable for display.
 */
export interface LocationContext {
  /** Latitude of the geohash cell centre. City-level precision only. */
  lat: number;
  /** Longitude of the geohash cell centre. City-level precision only. */
  lon: number;
  /** Human-readable display name, e.g. "London, UK" or "New York, US". */
  name: string;
}

/**
 * Timezone data returned when `CONSTANTS.SCOPES.TIMEZONE` is approved.
 */
export interface TimezoneContext {
  /** IANA timezone string, e.g. "Europe/London" or "America/New_York". */
  timezone: string;
  /** ISO 8601 local time string, e.g. "2026-03-17T14:30:00+00:00". */
  local_time: string;
}

/**
 * Device information returned when `CONSTANTS.SCOPES.DEVICE` is approved.
 */
export interface DeviceContext {
  /**
   * Device category. Compare with `CONSTANTS.DEVICE_CLASS` values.
   * "mobile" | "tablet" | "desktop"
   */
  class: "mobile" | "tablet" | "desktop";
  /** OS or platform string, e.g. "macOS", "iOS", "Android", "Windows". */
  platform: string;
}

// =============================================================================
// Discrete Value Types
// =============================================================================

/**
 * Possible values for the attention context field.
 * Compare with `CONSTANTS.ATTENTION` values.
 */
export type AttentionState = "focused" | "ambient" | "distracted";

// =============================================================================
// Scope → Return Type Mapping
// =============================================================================
// This conditional type is what makes ctx.get(CONSTANTS.SCOPES.LOCATION)
// return LocationContext | undefined (not just `unknown`). Each scope key
// maps to exactly the shape Chalie returns for that scope.

type ScopeReturnType<T extends string> =
  T extends "location" ? LocationContext :
  T extends "timezone" ? TimezoneContext :
  T extends "device" ? DeviceContext :
  T extends "energy" ? number :
  T extends "attention" ? AttentionState :
  never;

// =============================================================================
// ContextResult — returned by getContext()
// =============================================================================

/**
 * Typed context accessor returned by `getContext()`.
 *
 * Call `.get(CONSTANTS.SCOPES.*)` to read a context field. The return type
 * is inferred from the scope key — no casting needed.
 *
 * @example
 * ```ts
 * const ctx = await getContext();
 *
 * const location = ctx.get(CONSTANTS.SCOPES.LOCATION);
 * // LocationContext | undefined
 * console.log(location?.name); // "London, UK"
 *
 * const tz = ctx.get(CONSTANTS.SCOPES.TIMEZONE);
 * // TimezoneContext | undefined
 * console.log(tz?.timezone); // "Europe/London"
 *
 * const energy = ctx.get(CONSTANTS.SCOPES.ENERGY);
 * // number | undefined  (0.0 – 1.0)
 *
 * const attention = ctx.get(CONSTANTS.SCOPES.ATTENTION);
 * // AttentionState | undefined
 * if (attention === CONSTANTS.ATTENTION.FOCUSED) { ... }
 * ```
 */
export class ContextResult {
  private readonly _raw: Record<string, unknown>;

  constructor(raw: Record<string, unknown>) {
    this._raw = raw;
  }

  /**
   * Get a context field by scope key.
   *
   * Returns the typed value for the scope, or `undefined` if the user denied
   * that scope or the gateway is unreachable. Always use optional chaining
   * on the result — never assume a scope was approved.
   *
   * @param scope - A `CONSTANTS.SCOPES.*` key.
   * @returns     - The typed context value, or `undefined` if unavailable.
   */
  get<T extends string>(scope: T): ScopeReturnType<T> | undefined {
    if (scope === "timezone") {
      // timezone and local_time are top-level fields — wrap them into the
      // TimezoneContext shape so the API is consistent.
      const tz = this._raw["timezone"];
      const lt = this._raw["local_time"];
      if (tz === undefined) return undefined;
      return { timezone: tz, local_time: lt } as ScopeReturnType<T>;
    }
    const value = this._raw[scope];
    return value as ScopeReturnType<T> | undefined;
  }
}

// =============================================================================
// CONSTANTS — the single import developers need
// =============================================================================

/**
 * All Chalie interface constants, namespaced under a single object.
 *
 * Import once: `import { CONSTANTS } from "./constants.ts";`
 *
 * Then use:
 * - `CONSTANTS.SCOPES.*`      — scope keys for SCOPES declarations
 * - `CONSTANTS.ATTENTION.*`   — discrete attention state values
 * - `CONSTANTS.ENERGY.*`      — energy level thresholds
 * - `CONSTANTS.DEVICE_CLASS.*`— device class values
 */
export const CONSTANTS = {

  /**
   * Scope keys for the `context` section of your SCOPES declaration.
   *
   * Each key controls which fields `getContext().get(key)` returns.
   * If the user denies a scope, `.get()` returns `undefined` for that key.
   *
   * @example
   * ```ts
   * const SCOPES = {
   *   context: {
   *     [CONSTANTS.SCOPES.LOCATION]: "Required for weather at your current city",
   *     [CONSTANTS.SCOPES.TIMEZONE]: "Displays times in your local timezone",
   *   },
   * };
   * ```
   */
  SCOPES: {
    /**
     * City-level location (lat, lon, display name).
     * `.get(CONSTANTS.SCOPES.LOCATION)` → `LocationContext | undefined`
     * Raw GPS is never exposed — coordinates are geohash-snapped (~1 km).
     */
    LOCATION: "location" as const,

    /**
     * User's current timezone and local time.
     * `.get(CONSTANTS.SCOPES.TIMEZONE)` → `TimezoneContext | undefined`
     * Provides an IANA timezone string and an ISO 8601 local time.
     */
    TIMEZONE: "timezone" as const,

    /**
     * Device class and OS platform.
     * `.get(CONSTANTS.SCOPES.DEVICE)` → `DeviceContext | undefined`
     * Useful for adapting your UI layout or notification behaviour.
     */
    DEVICE: "device" as const,

    /**
     * User's current energy level, inferred from ambient signals.
     * `.get(CONSTANTS.SCOPES.ENERGY)` → `number | undefined` (0.0 – 1.0)
     * Compare with `CONSTANTS.ENERGY.*` thresholds.
     */
    ENERGY: "energy" as const,

    /**
     * User's current attention state, inferred from focus sessions and
     * interaction patterns.
     * `.get(CONSTANTS.SCOPES.ATTENTION)` → `AttentionState | undefined`
     * Compare with `CONSTANTS.ATTENTION.*` values.
     */
    ATTENTION: "attention" as const,
  },

  /**
   * Discrete values for the attention context field.
   *
   * Check attention before pushing messages. Interrupting focused work costs
   * user trust more than a missed notification.
   *
   * @example
   * ```ts
   * const attention = (await getContext()).get(CONSTANTS.SCOPES.ATTENTION);
   * if (attention === CONSTANTS.ATTENTION.FOCUSED) {
   *   await sendSignal("my_type", summary, 0.3); // downgrade to signal
   *   return;
   * }
   * await sendMessage(urgentText, "my_topic");
   * ```
   */
  ATTENTION: {
    /**
     * The user is in a focus session or Chalie has detected sustained
     * deep-work behaviour. Avoid interruptions. If your message is genuinely
     * urgent, downgrade to a signal and let Chalie decide whether to surface it.
     */
    FOCUSED: "focused" as const,

    /**
     * The user is available and receptive. Normal interaction behaviour.
     * Both signals and messages are appropriate.
     */
    AMBIENT: "ambient" as const,

    /**
     * The user is context-switching or showing distracted behaviour.
     * Prefer signals for anything that can wait.
     */
    DISTRACTED: "distracted" as const,
  },

  /**
   * Reference thresholds for the energy context field (0.0 – 1.0).
   *
   * `energy` is a continuous float — these constants give you named
   * thresholds for common decisions. Use `<` and `>=` comparisons:
   *
   * @example
   * ```ts
   * const energy = (await getContext()).get(CONSTANTS.SCOPES.ENERGY);
   * if (energy !== undefined && energy < CONSTANTS.ENERGY.LOW) {
   *   return; // user is very tired — skip non-essential notifications
   * }
   * ```
   */
  ENERGY: {
    /**
     * 0.25 — User is notably low energy.
     * Skip non-essential signals and messages.
     */
    LOW: 0.25 as const,

    /**
     * 0.5 — Neutral / baseline energy.
     * Normal notification behaviour is appropriate.
     */
    MEDIUM: 0.5 as const,

    /**
     * 0.75 — User is energised and engaged.
     * Good time for richer content or anything that benefits from active attention.
     */
    HIGH: 0.75 as const,
  },

  /**
   * Discrete values for `DeviceContext.class`.
   *
   * @example
   * ```ts
   * const device = (await getContext()).get(CONSTANTS.SCOPES.DEVICE);
   * if (device?.class === CONSTANTS.DEVICE_CLASS.MOBILE) {
   *   // Render compact layout
   * }
   * ```
   */
  DEVICE_CLASS: {
    /** Smartphone or small-screen handheld device. */
    MOBILE: "mobile" as const,
    /** Tablet or large-screen touch device. */
    TABLET: "tablet" as const,
    /** Laptop or desktop workstation. */
    DESKTOP: "desktop" as const,
  },

} as const;
