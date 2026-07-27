// ---------------------------------------------------------------------------
// Domain model for the BESS availability calculator.
//
// The graph the user draws is the single source of truth: React Flow nodes are
// BESS components, edges are connections on one of two layers (electrical or
// communication). All reliability fields live under `node.data` so the persisted
// JSON is decoupled from the diagramming library's internal shape.
// ---------------------------------------------------------------------------

export const SCHEMA_VERSION = 1;

/**
 * The subsystem groups. `aggregated` holds block-level shortcuts (DC block, AC
 * block, BESS block, ...) that stand in for a whole cluster of the granular
 * cell -> grid -> digital groups below; use them to sketch a site fast, then
 * swap in the granular components where you need a detailed teardown.
 */
export type Subsystem =
  | 'aggregated'
  | 'battery'
  | 'power-conversion'
  | 'mv-grid'
  | 'thermal-aux'
  | 'control-digital'
  | 'cloud-offsite';

/**
 * How a component's availability is sourced:
 *  - WARRANTED: a supplier contractually guarantees an availability % (treated
 *    as a fixed lower bound with no estimation noise).
 *  - ESTIMATED: no guarantee; availability derived from MTBF/MTTR with epistemic
 *    uncertainty propagated through the Monte Carlo.
 *  - SLA:       a cloud / telco service-level agreement % (contractual, but an
 *    external dependency, not a hardware warranty).
 */
export type AvailabilitySource = 'WARRANTED' | 'ESTIMATED' | 'SLA';

export type EdgeLayer = 'electrical' | 'communication';

/**
 * For comms / control / cloud components, how a loss affects the asset:
 *  - delivery     : in series for energy delivery (a loss stops power flow)
 *  - dispatch-only: needed only to bid / respond to dispatch (affects revenue)
 *  - monitoring   : observability only; the asset rides through (autonomous mode)
 */
export type ControlMode = 'delivery' | 'dispatch-only' | 'monitoring';

/** Optional software / firmware layer hosted on a hardware node. */
export interface SoftwareLayer {
  enabled: boolean;
  /** Software failure rate, failures per year. */
  failuresPerYear: number;
  /** Watchdog / auto-recovery coverage: fraction of faults cleared without a full outage. */
  watchdogCoverage: number;
  /** Mean time to auto-recover (watchdog restart), hours. */
  mttrAutoHours: number;
  /** Mean time for a full reboot / manual intervention, hours. */
  mttrRebootHours: number;
  /** Planned patch / reboot downtime, hours per year. */
  plannedPatchHoursPerYear: number;
}

/** Reliability + modelling attributes carried by every component node. */
export interface ComponentData {
  // Index signature so this satisfies React Flow's Node<T> data constraint.
  [key: string]: unknown;
  kind: string;
  label: string;
  subsystem: Subsystem;
  availabilitySource: AvailabilitySource;

  // ESTIMATED inputs
  mtbfHours: number;
  mttrHours: number;
  /**
   * Epistemic spread control: an "effective number of observed failures". Fewer
   * observed failures => wider uncertainty => a lower promised bound. The Monte
   * Carlo samples the failure rate from a Gamma posterior with this shape.
   */
  effectiveFailures: number;
  /** Log-space sigma for the lognormal MTTR uncertainty. */
  mttrLogSigma: number;

  // WARRANTED / SLA inputs (availability as a fraction in [0, 1])
  warrantedAvailability: number;
  /** For SLA: optional derate applied to the headline SLA to account for exclusions. */
  slaAdjustment: number;

  // Redundancy expressed at the node: this block is N parallel units, k required.
  redundancyN: number;
  redundancyK: number;

  /**
   * Optional capacity-based sizing, for blocks where N/k should be derived from a
   * contracted MW/MWh target instead of guessed directly (typical for BESS blocks
   * warranted per-unit by the OEM). Leave at 0 to ignore and set redundancyK by hand,
   * exactly like the plain k-of-n redundancy used for control equipment.
   */
  blockPowerMW: number;
  blockEnergyMWh: number;
  contractedPowerMW: number;
  contractedEnergyMWh: number;

  // Roles in the reliability network
  isElectricalSource: boolean;
  isDeliverySink: boolean;
  isControlSource: boolean;
  /** Communication role (only meaningful for comms / control / cloud kinds). */
  controlMode: ControlMode;

  software: SoftwareLayer;

  /** True for components widely treated as illustrative single points of failure. */
  spof: boolean;

  // Derived results written back after a compute pass (for rendering).
  result?: {
    /** Point (mean) availability of this block including redundancy + software. */
    availability: number;
    /** True if this block lies on the current weakest / critical path. */
    critical?: boolean;
  };
}

/** A site-level external event (grid outage, carrier outage, force majeure...). */
export interface ExternalEvent {
  id: string;
  label: string;
  /** Poisson arrival rate, events per year. */
  freqPerYear: number;
  /** Mean outage duration, hours. */
  meanDurationHours: number;
  /** Whether this event counts against the contractual (promised) availability. */
  includeInContractual: boolean;
}

/** Settings for the Monte Carlo confidence run. */
export interface SimSettings {
  /** Number of Monte Carlo draws. */
  samples: number;
  /** One-sided confidence level for the promised lower bound, e.g. 0.9. */
  confidence: number;
  /** RNG seed for reproducibility. */
  seed: number;
}

export const DEFAULT_SIM_SETTINGS: SimSettings = {
  samples: 10000,
  confidence: 0.95,
  seed: 12345,
};

export const DEFAULT_SOFTWARE: SoftwareLayer = {
  enabled: false,
  failuresPerYear: 2,
  watchdogCoverage: 0.9,
  mttrAutoHours: 0.05,
  mttrRebootHours: 1,
  plannedPatchHoursPerYear: 4,
};
