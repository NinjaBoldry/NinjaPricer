'use client';
import { createContext, useContext } from 'react';
import type { ComputeResult } from '@/lib/engine/types';

export interface ScenarioComputeCtx {
  computeResult: ComputeResult | null;
  triggerCompute: () => void;
}

export const ScenarioComputeContext = createContext<ScenarioComputeCtx>({
  computeResult: null,
  triggerCompute: () => {},
});

export function useScenarioCompute() {
  return useContext(ScenarioComputeContext);
}
