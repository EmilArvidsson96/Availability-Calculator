// ---------------------------------------------------------------------------
// User customization of the component palette: hide built-in kinds you don't
// use, and add fully custom ones (e.g. a bespoke aggregated block). Persisted
// to localStorage, independent of the graph itself so it carries across
// projects.
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import { CATALOG, instantiateTemplate, type ComponentTemplate } from '../data/componentLibrary';
import type { ComponentData } from '../types/model';

const STORAGE_KEY = 'bess-availability-calculator:catalog:v1';

interface CatalogPersistShape {
  hiddenKinds: string[];
  customComponents: ComponentTemplate[];
}

interface CatalogState {
  hiddenKinds: string[];
  customComponents: ComponentTemplate[];

  setHidden: (kind: string, hidden: boolean) => void;
  addCustomComponent: (template: ComponentTemplate) => void;
  removeCustomComponent: (kind: string) => void;
}

function persist(state: CatalogPersistShape) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage may be unavailable; ignore */
  }
}

function loadInitial(): CatalogPersistShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CatalogPersistShape>;
      return { hiddenKinds: parsed.hiddenKinds ?? [], customComponents: parsed.customComponents ?? [] };
    }
  } catch {
    /* fall through to defaults */
  }
  return { hiddenKinds: [], customComponents: [] };
}

const initial = loadInitial();

export const useCatalogStore = create<CatalogState>((set, get) => ({
  hiddenKinds: initial.hiddenKinds,
  customComponents: initial.customComponents,

  setHidden: (kind, hidden) => {
    const cur = new Set(get().hiddenKinds);
    if (hidden) cur.add(kind);
    else cur.delete(kind);
    const hiddenKinds = Array.from(cur);
    set({ hiddenKinds });
    persist({ hiddenKinds, customComponents: get().customComponents });
  },

  addCustomComponent: (template) => {
    const customComponents = [...get().customComponents.filter((c) => c.kind !== template.kind), template];
    set({ customComponents });
    persist({ hiddenKinds: get().hiddenKinds, customComponents });
  },

  removeCustomComponent: (kind) => {
    const customComponents = get().customComponents.filter((c) => c.kind !== kind);
    const hiddenKinds = get().hiddenKinds.filter((k) => k !== kind);
    set({ customComponents, hiddenKinds });
    persist({ hiddenKinds, customComponents });
  },
}));

/** All templates — built-ins plus user-created custom ones. */
export function allTemplates(): ComponentTemplate[] {
  return [...CATALOG, ...useCatalogStore.getState().customComponents];
}

/** Look up any template (built-in or custom) by kind. */
export function resolveTemplate(kind: string): ComponentTemplate | undefined {
  return allTemplates().find((t) => t.kind === kind);
}

/** Build a fresh ComponentData for any palette kind, built-in or custom. */
export function instantiateAny(kind: string): ComponentData {
  const t = resolveTemplate(kind);
  return t ? instantiateTemplate(t) : instantiateTemplate({ kind, label: kind, subsystem: 'battery', icon: '⬛', hint: '', overrides: {} });
}

/** Generate a unique kind key for a new custom component from its label. */
export function nextCustomKind(label: string): string {
  const slug =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'component';
  const existing = new Set(allTemplates().map((t) => t.kind));
  let kind = `custom-${slug}`;
  let i = 2;
  while (existing.has(kind)) {
    kind = `custom-${slug}-${i++}`;
  }
  return kind;
}
