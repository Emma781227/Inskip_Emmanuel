import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { useAppStore } from '../state/AppStore';
import { EmptyState, LoadingState } from './ui';

/** Affiche le chargement ou l'erreur de chargement des idées, sinon le contenu. */
export function DataGate({ children }: { children: ReactNode }) {
  const { load, retryLoad, dataset, restoreDefaultDataset } = useAppStore();
  if (load.status === 'loading') return <LoadingState label="Chargement des idées…" />;
  if (load.status === 'error') {
    return (
      <div className="card">
        <EmptyState
          icon={AlertTriangle}
          title="Les idées n'ont pas pu être chargées"
          action={
            <div className="flex gap-2">
              <button type="button" className="btn-primary" onClick={retryLoad}>
                Réessayer
              </button>
              {dataset.imported && (
                <button type="button" className="btn-secondary" onClick={restoreDefaultDataset}>
                  Revenir aux idées Hexavia
                </button>
              )}
            </div>
          }
        >
          {load.message}
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}
