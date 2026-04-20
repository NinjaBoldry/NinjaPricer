'use client';
import { useState, useEffect, useCallback } from 'react';
import type { Role } from '@prisma/client';
import type { ComputeResult } from '@/lib/engine/types';
import { ScenarioComputeContext } from './ScenarioComputeContext';
import ScenarioRail from './ScenarioRail';
import BundlePicker from './BundlePicker';

interface Bundle {
  id: string;
  name: string;
}

interface Props {
  scenarioId: string;
  userRole: Role;
  bundles: Bundle[];
  appliedBundleId: string | null;
  children: React.ReactNode;
}

export default function ScenarioBuilderClient({
  scenarioId,
  userRole,
  bundles,
  appliedBundleId,
  children,
}: Props) {
  const [computeResult, setComputeResult] = useState<ComputeResult | null>(null);

  const triggerCompute = useCallback(() => {
    fetch('/api/compute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenarioId }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ComputeResult | null) => {
        if (data) setComputeResult(data);
      })
      .catch(() => {});
  }, [scenarioId]);

  useEffect(() => {
    triggerCompute();
  }, [triggerCompute]);

  return (
    <ScenarioComputeContext.Provider value={{ computeResult, triggerCompute }}>
      <div className="flex flex-1 overflow-hidden">
        <ScenarioRail userRole={userRole} computeResult={computeResult} />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="border-b px-6 py-2 bg-slate-50">
            <BundlePicker
              scenarioId={scenarioId}
              bundles={bundles}
              appliedBundleId={appliedBundleId}
              onApplied={triggerCompute}
            />
          </div>
          {children}
        </div>
      </div>
    </ScenarioComputeContext.Provider>
  );
}
