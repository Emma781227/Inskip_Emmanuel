import { Download, ListChecks, Printer, StarOff, AlertTriangle } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DataGate } from '../components/DataGate';
import { EmptyState, Notice, PageHeader, ScoreValue, Tag } from '../components/ui';
import { buildShortlist, shortlistSizeStatus, shortlistToCsv, SHORTLIST_TARGET } from '../domain/shortlist';
import { CRITERIA, CRITERION_LABELS } from '../domain/types';
import { useAppStore } from '../state/AppStore';

export function ShortlistPage() {
  return (
    <DataGate>
      <Shortlist />
    </DataGate>
  );
}

function downloadText(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function Shortlist() {
  const { ideas, workspace, toggleShortlist, dataset, notify } = useAppStore();
  const rows = useMemo(() => buildShortlist(ideas, workspace), [ideas, workspace]);
  const unevaluated = rows.filter((row) => !row.evaluation).length;
  const sizeStatus = shortlistSizeStatus(rows.length);
  const today = new Date().toLocaleDateString('fr-FR');

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadText(`shortlist-${stamp}.csv`, shortlistToCsv(rows), 'text/csv;charset=utf-8');
    notify(`Shortlist exportée (${rows.length} idée${rows.length > 1 ? 's' : ''}).`);
  };

  return (
    <>
      <PageHeader
        title="Shortlist pour le jury"
        description={
          <>
            <span className="no-print">Idées retenues, classées par score final. Objectif indicatif : environ {SHORTLIST_TARGET} idées.</span>
            <span className="hidden print:inline">{dataset.name} · {rows.length} idées retenues · document du {today}</span>
          </>
        }
        actions={
          rows.length > 0 && (
            <>
              <button type="button" className="btn-secondary" onClick={() => window.print()}>
                <Printer className="size-4" aria-hidden />
                Imprimer / PDF
              </button>
              <button type="button" className="btn-primary" onClick={exportCsv}>
                <Download className="size-4" aria-hidden />
                Exporter en CSV
              </button>
            </>
          )
        }
      />

      {rows.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ListChecks}
            title="Aucune idée retenue pour l'instant"
            action={<Link to="/?sort=score-desc" className="btn-primary">Voir les idées les mieux notées</Link>}
          >
            Ouvrez une idée et cliquez sur « Retenir pour le jury ». Les idées retenues apparaîtront ici, prêtes à être exportées.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="no-print mb-4 space-y-3">
            {sizeStatus === 'below' && (
              <Notice>{rows.length} idée{rows.length > 1 ? 's' : ''} retenue{rows.length > 1 ? 's' : ''} : vous visiez environ {SHORTLIST_TARGET} idées.</Notice>
            )}
            {sizeStatus === 'above' && (
              <Notice>{rows.length} idées retenues : c'est un peu plus que la cible d'environ {SHORTLIST_TARGET}. À vous de juger.</Notice>
            )}
            {unevaluated > 0 && (
              <Notice tone="warning" title={`${unevaluated} idée${unevaluated > 1 ? 's' : ''} sans évaluation validée`}>
                Elles apparaissent sans score dans l'export. Ouvrez-les pour valider vos notes.
              </Notice>
            )}
          </div>

          <ol className="space-y-4">
            {rows.map((row) => (
              <li key={row.idea.id} className="card print-break-avoid p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ink-900 text-sm font-semibold text-white">{row.rank}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{row.idea.id}</span>
                        {row.idea.theme && <Tag>{row.idea.theme}</Tag>}
                      </div>
                      <Link to={`/idees/${row.idea.id}`} className="mt-0.5 block text-base font-semibold text-ink-900 hover:text-accent-600">
                        {row.idea.title}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {row.idea.author.firstName} {row.idea.author.lastName} · {row.idea.direction ?? '—'} · {row.idea.site ?? '—'} · Budget : {row.idea.budgetRaw || 'non renseigné'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-12 sm:pl-0">
                    <ScoreValue score={row.finalScore} size="lg" />
                    <button type="button" className="btn-ghost no-print" onClick={() => toggleShortlist(row.idea.id)} title="Retirer de la shortlist">
                      <StarOff className="size-4" aria-hidden />
                      <span className="sm:sr-only">Retirer</span>
                    </button>
                  </div>
                </div>

                <p className="mt-3 text-sm leading-relaxed text-slate-700 sm:pl-12">{row.idea.description}</p>

                {row.evaluation ? (
                  <div className="mt-4 sm:pl-12">
                    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {CRITERIA.map((key) => (
                        <div key={key} className="rounded-lg bg-slate-50 px-3 py-2">
                          <dt className="text-xs text-slate-500">{CRITERION_LABELS[key]}</dt>
                          <dd className="text-sm font-semibold text-ink-900 tabular-nums">{row.evaluation!.scores[key]}/5</dd>
                        </div>
                      ))}
                    </dl>
                    {row.evaluation.comment && (
                      <blockquote className="mt-3 border-l-2 border-ink-700 pl-3 text-sm text-slate-700 italic">{row.evaluation.comment}</blockquote>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-orange-700 sm:pl-12">
                    <AlertTriangle className="size-4" aria-hidden />
                    Évaluation non validée.
                  </p>
                )}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-slate-500">
            Scores : moyenne simple des quatre critères notés de 1 à 5 par la consultante. Seules les notes validées par la consultante comptent ; les propositions automatiques de l'outil ne sont qu'un point de départ.
          </p>
        </>
      )}
    </>
  );
}
