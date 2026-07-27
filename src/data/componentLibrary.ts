// ---------------------------------------------------------------------------
// The component palette: a BESS taxonomy in cell -> grid -> digital order.
//
// Every default value here is ILLUSTRATIVE and meant to be overridden per
// project from the actual OEM datasheet, the signed LTSA / TAG contract, and the
// site single-line diagram. The warranted / estimated / SLA flag reflects how the
// number is typically sourced in industry.
// ---------------------------------------------------------------------------

import {
  type ComponentData,
  type Subsystem,
  DEFAULT_SOFTWARE,
} from '../types/model';

export interface SubsystemMeta {
  key: Subsystem;
  label: string;
  color: string;
}

export const SUBSYSTEMS: SubsystemMeta[] = [
  { key: 'aggregated', label: 'Aggregated Blocks', color: '#f59e0b' },
  { key: 'battery', label: 'Battery', color: '#16a34a' },
  { key: 'power-conversion', label: 'Power Conversion', color: '#ea580c' },
  { key: 'mv-grid', label: 'MV / Grid', color: '#2563eb' },
  { key: 'thermal-aux', label: 'Thermal / Auxiliary', color: '#0d9488' },
  { key: 'control-digital', label: 'Control / Digital', color: '#7c3aed' },
  { key: 'cloud-offsite', label: 'Cloud / Offsite', color: '#64748b' },
];

export const SUBSYSTEM_COLOR: Record<Subsystem, string> = Object.fromEntries(
  SUBSYSTEMS.map((s) => [s.key, s.color]),
) as Record<Subsystem, string>;

export const SUBSYSTEM_LABEL: Record<Subsystem, string> = Object.fromEntries(
  SUBSYSTEMS.map((s) => [s.key, s.label]),
) as Record<Subsystem, string>;

export interface ComponentTemplate {
  kind: string;
  label: string;
  subsystem: Subsystem;
  icon: string;
  hint: string;
  overrides: Partial<ComponentData>;
}

function base(): ComponentData {
  return {
    kind: '',
    label: '',
    subsystem: 'battery',
    availabilitySource: 'ESTIMATED',
    mtbfHours: 100000,
    mttrHours: 24,
    effectiveFailures: 10,
    mttrLogSigma: 0.5,
    warrantedAvailability: 0.99,
    slaAdjustment: 0.98,
    redundancyN: 1,
    redundancyK: 1,
    blockPowerMW: 0,
    blockEnergyMWh: 0,
    contractedPowerMW: 0,
    contractedEnergyMWh: 0,
    isElectricalSource: false,
    isDeliverySink: false,
    isControlSource: false,
    controlMode: 'delivery',
    software: { ...DEFAULT_SOFTWARE },
    spof: false,
  };
}

export const CATALOG: ComponentTemplate[] = [
  // --- Aggregated Blocks -----------------------------------------------------
  // Shortcuts that stand in for a whole cluster of granular components below —
  // use these to sketch a site fast as N parallel blocks feeding a shared
  // MV/transformer/grid chain, instead of wiring every rack and combiner by hand.
  {
    kind: 'dc-block',
    label: 'DC Block',
    subsystem: 'aggregated',
    icon: '🗄️',
    hint: 'Aggregated DC side of one block — racks + rack BMS + DC combiner as a single unit. Add one per physical block/container and wire in parallel with its siblings into a shared AC block or PCS.',
    overrides: {
      mtbfHours: 150000,
      mttrHours: 24,
      effectiveFailures: 8,
      isElectricalSource: true,
      spof: true,
    },
  },
  {
    kind: 'ac-block',
    label: 'AC Block',
    subsystem: 'aggregated',
    icon: '🔁',
    hint: 'Aggregated AC side of one block — PCS + LV switchgear as a single unit converting a DC block’s output. Add one per block, downstream of its DC block(s).',
    overrides: {
      mtbfHours: 60000,
      mttrHours: 12,
      effectiveFailures: 8,
      spof: true,
    },
  },
  {
    kind: 'bess-block',
    label: 'BESS Block (DC+AC)',
    subsystem: 'aggregated',
    icon: '📦',
    hint: 'Fully integrated containerized block — battery + PCS + thermal management as one OEM-warranted unit. Represent the whole array as ONE node: set Redundancy to n = blocks built, and use "Derive k from contracted capacity" with each block\'s MW/MWh rating to size how many can be down while still meeting the contracted capacity.',
    overrides: {
      availabilitySource: 'WARRANTED',
      warrantedAvailability: 0.97,
      redundancyN: 10,
      redundancyK: 8,
      blockPowerMW: 5,
      blockEnergyMWh: 10,
      contractedPowerMW: 40,
      contractedEnergyMWh: 80,
      isElectricalSource: true,
      spof: true,
    },
  },

  // --- Battery -------------------------------------------------------------
  {
    kind: 'battery-rack',
    label: 'Battery Rack',
    subsystem: 'battery',
    icon: '🔋',
    hint: 'Stacked modules + rack BMS. Many racks in parallel degrade gracefully.',
    overrides: {
      availabilitySource: 'WARRANTED',
      warrantedAvailability: 0.997,
      isElectricalSource: true,
    },
  },
  {
    kind: 'bms-master',
    label: 'Master BMS',
    subsystem: 'battery',
    icon: '🧠',
    hint: 'System/master battery controller. A fault can take the whole container offline.',
    overrides: { availabilitySource: 'WARRANTED', warrantedAvailability: 0.998, spof: true },
  },
  {
    kind: 'dc-combiner',
    label: 'DC Combiner',
    subsystem: 'battery',
    icon: '🔌',
    hint: 'Shared DC aggregation point — a single point of failure for the racks behind it.',
    overrides: { mtbfHours: 500000, mttrHours: 8, spof: true },
  },
  {
    kind: 'fire-suppression',
    label: 'Fire Suppression',
    subsystem: 'battery',
    icon: '🧯',
    hint: 'Safety/trip system: a spurious trip can force a precautionary shutdown.',
    overrides: { mtbfHours: 400000, mttrHours: 12 },
  },

  // --- Power Conversion ----------------------------------------------------
  {
    kind: 'pcs-central',
    label: 'Central PCS',
    subsystem: 'power-conversion',
    icon: '⚡',
    hint: 'One large inverter per block — a failure drops the full block.',
    overrides: { availabilitySource: 'WARRANTED', warrantedAvailability: 0.98, spof: true },
  },
  {
    kind: 'pcs-string',
    label: 'String PCS (N+1)',
    subsystem: 'power-conversion',
    icon: '⚡',
    hint: 'Multiple modular inverters; one fails, the rest carry the load.',
    overrides: { mtbfHours: 80000, mttrHours: 12, redundancyN: 6, redundancyK: 5 },
  },
  {
    kind: 'lv-switchgear',
    label: 'LV Switchgear',
    subsystem: 'power-conversion',
    icon: '🔲',
    hint: 'AC-side protection between PCS and transformer.',
    overrides: { mtbfHours: 600000, mttrHours: 24 },
  },

  // --- MV / Grid -----------------------------------------------------------
  {
    kind: 'transformer',
    label: 'Step-up Transformer',
    subsystem: 'mv-grid',
    icon: '🏭',
    hint: 'Long replacement lead time — MTTR (weeks) dominates the availability hit.',
    overrides: { mtbfHours: 800000, mttrHours: 720, effectiveFailures: 6, mttrLogSigma: 0.7, spof: true },
  },
  {
    kind: 'mv-switchgear',
    label: 'MV Switchgear',
    subsystem: 'mv-grid',
    icon: '🔳',
    hint: 'MV breakers / ring main unit.',
    overrides: { mtbfHours: 700000, mttrHours: 48 },
  },
  {
    kind: 'protection-relay',
    label: 'Protection Relay',
    subsystem: 'mv-grid',
    icon: '🛡️',
    hint: 'Trip system — spurious trips cause forced outages.',
    overrides: { mtbfHours: 900000, mttrHours: 8 },
  },
  {
    kind: 'grid-connection',
    label: 'Grid Connection (POI)',
    subsystem: 'mv-grid',
    icon: '🌐',
    hint: 'Point of interconnection. The single largest non-redundant dependency.',
    overrides: { mtbfHours: 200000, mttrHours: 24, isDeliverySink: true, spof: true },
  },
  {
    kind: 'metering',
    label: 'Revenue Meter',
    subsystem: 'mv-grid',
    icon: '📟',
    hint: 'Settlement metering — a fault can suspend market participation.',
    overrides: { mtbfHours: 800000, mttrHours: 8 },
  },

  // --- Thermal / Auxiliary -------------------------------------------------
  {
    kind: 'hvac',
    label: 'HVAC / Cooling (N+1)',
    subsystem: 'thermal-aux',
    icon: '❄️',
    hint: 'Pumps/chillers are the failure-prone moving parts; N+1 protects the temperature window.',
    overrides: { mtbfHours: 40000, mttrHours: 12, redundancyN: 3, redundancyK: 2 },
  },
  {
    kind: 'aux-ups',
    label: 'Aux Power / UPS',
    subsystem: 'thermal-aux',
    icon: '🔋',
    hint: 'Loss of control power can blind/shut the whole site.',
    overrides: { mtbfHours: 300000, mttrHours: 6, redundancyN: 2, redundancyK: 1, spof: true },
  },

  // --- Control / Digital ---------------------------------------------------
  {
    kind: 'ems-ppc',
    label: 'EMS / PPC',
    subsystem: 'control-digital',
    icon: '🎛️',
    hint: 'Power plant controller / dispatch. Delivery-critical control source.',
    overrides: {
      mtbfHours: 50000,
      mttrHours: 4,
      redundancyN: 2,
      redundancyK: 1,
      isControlSource: true,
      controlMode: 'delivery',
      software: { ...DEFAULT_SOFTWARE, enabled: true },
    },
  },
  {
    kind: 'scada',
    label: 'SCADA / Site Controller',
    subsystem: 'control-digital',
    icon: '🖥️',
    hint: 'Monitoring & operator control; may halt dispatch but not power flow.',
    overrides: { mtbfHours: 60000, mttrHours: 4, controlMode: 'dispatch-only', software: { ...DEFAULT_SOFTWARE, enabled: true } },
  },
  {
    kind: 'comms-gateway',
    label: 'Comms Gateway / RTU',
    subsystem: 'control-digital',
    icon: '📡',
    hint: 'TSO-facing protocol gateway. Loss can trigger a mandated trip.',
    overrides: { mtbfHours: 120000, mttrHours: 6, controlMode: 'delivery' },
  },
  {
    kind: 'network-switch',
    label: 'Network Switch',
    subsystem: 'control-digital',
    icon: '🔀',
    hint: 'OT network. Ring/redundant topology makes single failures non-service-affecting.',
    overrides: { mtbfHours: 200000, mttrHours: 4, redundancyN: 2, redundancyK: 1, controlMode: 'delivery' },
  },
  {
    kind: 'wan',
    label: 'WAN (Fiber/Cellular)',
    subsystem: 'control-digital',
    icon: '🛰️',
    hint: 'Backhaul to cloud/market/TSO. Often the weakest link; dual-bearer helps.',
    overrides: { mtbfHours: 20000, mttrHours: 6, controlMode: 'dispatch-only' },
  },

  // --- Cloud / Offsite -----------------------------------------------------
  {
    kind: 'cloud-ems',
    label: 'Cloud EMS / Optimizer',
    subsystem: 'cloud-offsite',
    icon: '☁️',
    hint: 'Cloud optimization/dispatch. If the site rides through, mark as dispatch-only.',
    overrides: { availabilitySource: 'SLA', warrantedAvailability: 0.999, slaAdjustment: 0.98, controlMode: 'dispatch-only' },
  },
  {
    kind: 'market-api',
    label: 'Market / Dispatch API',
    subsystem: 'cloud-offsite',
    icon: '📈',
    hint: 'TSO/market interface. Loss means lost revenue, not lost power.',
    overrides: { availabilitySource: 'SLA', warrantedAvailability: 0.999, slaAdjustment: 0.98, controlMode: 'dispatch-only' },
  },
  {
    kind: 'remote-monitoring',
    label: 'Remote Monitoring',
    subsystem: 'cloud-offsite',
    icon: '👁️',
    hint: 'Observability only; loss extends MTTR by delaying fault detection.',
    overrides: { availabilitySource: 'SLA', warrantedAvailability: 0.999, slaAdjustment: 0.99, controlMode: 'monitoring' },
  },
];

const CATALOG_BY_KIND = new Map(CATALOG.map((t) => [t.kind, t]));

export function templateFor(kind: string): ComponentTemplate | undefined {
  return CATALOG_BY_KIND.get(kind);
}

/** Build a fresh ComponentData from any template (built-in or user-created). */
export function instantiateTemplate(t: ComponentTemplate): ComponentData {
  const d = base();
  return {
    ...d,
    ...t.overrides,
    kind: t.kind,
    label: t.label,
    subsystem: t.subsystem,
    software: { ...(t.overrides.software ?? d.software) },
  };
}

/** Build a fresh ComponentData for a built-in catalog kind. */
export function instantiate(kind: string): ComponentData {
  const t = CATALOG_BY_KIND.get(kind);
  return t ? instantiateTemplate(t) : base();
}
