// Monte Carlo worker: keeps the heavy simulation off the UI thread.
import { runMonteCarlo, type ScenarioInput } from './compute';
import type { SimSettings } from '../types/model';

export interface WorkerRequest {
  input: ScenarioInput;
  settings: SimSettings;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { input, settings } = e.data;
  try {
    const result = runMonteCarlo(input, settings, (frac) => {
      (self as unknown as Worker).postMessage({ type: 'progress', frac });
    });
    (self as unknown as Worker).postMessage({ type: 'result', result });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
