import { AlertTriangle, FileUp, Inbox } from 'lucide-react';
import { useRef, type ChangeEvent, type ReactNode } from 'react';
import { useAppStore } from '../state/AppStore';
import { EmptyState, LoadingState } from './ui';

/** Sélecteur de fichier CSV réutilisable (import idempotent des idées). */
export function ImportCsvButton({ variant = 'secondary', label = 'Importer un CSV' }: { variant?: 'primary' | 'secondary'; label?: string }) {
  const { importCsvFile, importing } = useAppStore();
  const input = useRef<HTMLInputElement>(null);
  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await importCsvFile(file);
  };
  return (
    <>
      <button type="button" className={variant === 'primary' ? 'btn-primary' : 'btn-secondary'} onClick={() => input.current?.click()} disabled={importing}>
        <FileUp className="size-4" aria-hidden />
        {importing ? 'Import en cours…' : label}
      </button>
      <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
    </>
  );
}

/** Affiche le chargement, l'erreur ou l'absence d'idées ; sinon le contenu. */
export function DataGate({ children }: { children: ReactNode }) {
  const { load, retryLoad, ideas } = useAppStore();
  if (load.status === 'idle' || load.status === 'loading') return <LoadingState label="Chargement des idées…" />;
  if (load.status === 'error') {
    return (
      <div className="card">
        <EmptyState
          icon={AlertTriangle}
          title="Les idées n'ont pas pu être chargées"
          action={
            <button type="button" className="btn-primary" onClick={retryLoad}>
              Réessayer
            </button>
          }
        >
          {load.message}
        </EmptyState>
      </div>
    );
  }
  if (ideas.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={Inbox} title="Aucune idée pour l'instant" action={<ImportCsvButton variant="primary" label="Importer le fichier des idées" />}>
          Importez l'export du formulaire (fichier CSV, séparateur point-virgule). Vous pourrez réimporter le même fichier sans créer de doublon.
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}
