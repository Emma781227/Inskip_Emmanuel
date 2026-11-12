import { ChevronRight, Copy, FileUp, Inbox, ListChecks, Search, Sparkles, Star, SearchX, CheckCircle2, X } from 'lucide-react';
import { useMemo, useRef, type ChangeEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { DataGate } from '../components/DataGate';
import { EmptyState, KpiCard, Notice, PageHeader, ScoreValue, STATUS_LABELS, StatusBadge, Tag, formatDate } from '../components/ui';
import {
  DEFAULT_FILTERS,
  NOT_PROVIDED,
  SORT_LABELS,
  distinctValues,
  filterAndSortIdeas,
  type IdeaFilters,
  type SortOption,
} from '../domain/filters';
import { evaluationStatus, finalScore } from '../domain/scoring';
import { SHORTLIST_TARGET } from '../domain/shortlist';
import type { EvaluationStatus } from '../domain/types';
import { useAppStore } from '../state/AppStore';

const FILTER_KEYS = ['query', 'direction', 'theme', 'site', 'status', 'sort'] as const;

/** Les filtres vivent dans l'URL : ils survivent au passage par la fiche d'une idée. */
function useFiltersFromUrl(): [IdeaFilters, (patch: Partial<IdeaFilters>) => void, () => void] {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const sort = params.get('sort') ?? '';
  const filters: IdeaFilters = {
    query: params.get('q') ?? '',
    direction: params.get('direction') ?? '',
    theme: params.get('theme') ?? '',
    site: params.get('site') ?? '',
    status: status in STATUS_LABELS ? (status as EvaluationStatus) : '',
    sort: sort in SORT_LABELS ? (sort as SortOption) : DEFAULT_FILTERS.sort,
  };
  const update = (patch: Partial<IdeaFilters>) => {
    const next = { ...filters, ...patch };
    const search = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = next[key];
      if (value && value !== DEFAULT_FILTERS[key]) search.set(key === 'query' ? 'q' : key, value);
    }
    setParams(search, { replace: true });
  };
  const reset = () => setParams(new URLSearchParams(), { replace: true });
  return [filters, update, reset];
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  hasMissing,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  hasMissing: boolean;
}) {
  return (
    <label className="min-w-0">
      <span className="label">{label}</span>
      <select className="field" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Toutes</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
        {hasMissing && <option value={NOT_PROVIDED}>Non renseigné</option>}
      </select>
    </label>
  );
}

export function DashboardPage() {
  return (
    <DataGate>
      <Dashboard />
    </DataGate>
  );
}

function Dashboard() {
  const {
    ideas,
    workspace,
    duplicatesOf,
    duplicatePairCount,
    aiPending,
    generateAllAiSuggestions,
    importCsvFile,
    dataset,
    restoreDefaultDataset,
    importWarnings,
  } = useAppStore();
  const navigate = useNavigate();
  const location = useLocation();
  const backState = { from: `${location.pathname}${location.search}` };
  const fileInput = useRef<HTMLInputElement>(null);
  const [filters, setFilters, resetFilters] = useFiltersFromUrl();

  const directions = useMemo(() => distinctValues(ideas, (idea) => idea.direction), [ideas]);
  const themes = useMemo(() => distinctValues(ideas, (idea) => idea.theme), [ideas]);
  const sites = useMemo(() => distinctValues(ideas, (idea) => idea.site), [ideas]);
  const visible = useMemo(() => filterAndSortIdeas(ideas, workspace, filters), [ideas, workspace, filters]);

  const evaluatedCount = ideas.filter((idea) => workspace.evaluations[idea.id]).length;
  const aiCount = ideas.filter((idea) => workspace.aiSuggestions[idea.id]).length;
  const shortlistCount = Object.keys(workspace.shortlist).length;
  const ideasWithDuplicates = ideas.filter((idea) => duplicatesOf(idea.id).length > 0).length;
  const filtersActive = FILTER_KEYS.some((key) => key !== 'sort' && filters[key] !== '');
  const generating = aiPending.size > 0;

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await importCsvFile(file);
  };

  return (
    <>
      <PageHeader
        title="Idées déposées"
        description="Consultez, filtrez et évaluez les idées du challenge. Cliquez sur une idée pour la noter."
        actions={
          <>
            <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}>
              <FileUp className="size-4" aria-hidden />
              Importer un CSV
            </button>
            <input ref={fileInput} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            <button type="button" className="btn-primary" onClick={generateAllAiSuggestions} disabled={generating || aiCount === ideas.length}>
              <Sparkles className="size-4" aria-hidden />
              {generating ? 'Analyse en cours…' : aiCount === ideas.length ? 'Toutes pré-notées' : 'Pré-noter avec l’IA'}
            </button>
          </>
        }
      />

      {dataset.imported && (
        <div className="mb-4">
          <Notice title={`Fichier importé : ${dataset.name}`}>
            Les évaluations de ce fichier sont conservées séparément de celles du challenge Hexavia.{' '}
            <button type="button" className="font-medium underline" onClick={restoreDefaultDataset}>
              Revenir aux idées Hexavia
            </button>
          </Notice>
        </div>
      )}
      {importWarnings.length > 0 && (
        <div className="mb-4">
          <Notice tone="warning" title="Certaines lignes du fichier ont été ajustées">
            <ul className="list-disc pl-4">
              {importWarnings.slice(0, 5).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </Notice>
        </div>
      )}

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Indicateurs">
        <KpiCard icon={Inbox} label="Idées déposées" value={ideas.length} hint={`${aiCount} pré-notée${aiCount > 1 ? 's' : ''} par l’IA`} />
        <KpiCard icon={CheckCircle2} label="Idées évaluées" value={`${evaluatedCount}/${ideas.length}`} hint="Notes validées par vous" />
        <KpiCard icon={Copy} label="Doublons potentiels" value={duplicatePairCount} hint={`${ideasWithDuplicates} idées concernées`} />
        <KpiCard icon={ListChecks} label="Shortlist" value={shortlistCount} hint={`Objectif : environ ${SHORTLIST_TARGET}`} />
      </section>

      <section className="card" aria-label="Liste des idées">
        <div className="grid grid-cols-2 gap-3 border-b border-slate-200 p-4 sm:grid-cols-3 lg:grid-cols-[2fr_repeat(5,1fr)]">
          <label className="col-span-2 sm:col-span-3 lg:col-span-1">
            <span className="label">Rechercher</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                type="search"
                className="field pl-9"
                placeholder="Titre, description ou n° d'idée"
                value={filters.query}
                onChange={(event) => setFilters({ query: event.target.value })}
              />
            </span>
          </label>
          <FilterSelect label="Direction" value={filters.direction} onChange={(direction) => setFilters({ direction })} options={directions.values} hasMissing={directions.hasMissing} />
          <FilterSelect label="Thème" value={filters.theme} onChange={(theme) => setFilters({ theme })} options={themes.values} hasMissing={themes.hasMissing} />
          <FilterSelect label="Site" value={filters.site} onChange={(site) => setFilters({ site })} options={sites.values} hasMissing={sites.hasMissing} />
          <label>
            <span className="label">Statut</span>
            <select className="field" value={filters.status} onChange={(event) => setFilters({ status: event.target.value as EvaluationStatus | '' })}>
              <option value="">Tous</option>
              {(Object.keys(STATUS_LABELS) as EvaluationStatus[]).map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label">Trier par</span>
            <select className="field" value={filters.sort} onChange={(event) => setFilters({ sort: event.target.value as SortOption })}>
              {(Object.keys(SORT_LABELS) as SortOption[]).map((sort) => (
                <option key={sort} value={sort}>
                  {SORT_LABELS[sort]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex items-center justify-between px-4 py-2.5 text-sm text-slate-500">
          <span>
            <strong className="font-semibold text-ink-900">{visible.length}</strong> idée{visible.length > 1 ? 's' : ''} affichée{visible.length > 1 ? 's' : ''} sur {ideas.length}
          </span>
          {filtersActive && (
            <button type="button" className="btn-ghost -my-1 px-2 py-1" onClick={resetFilters}>
              <X className="size-3.5" aria-hidden />
              Effacer les filtres
            </button>
          )}
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Aucune idée ne correspond"
            action={
              <button type="button" className="btn-secondary" onClick={resetFilters}>
                Effacer les filtres
              </button>
            }
          >
            Essayez un autre mot-clé ou retirez un filtre.
          </EmptyState>
        ) : (
          <>
            {/* Tableau — écrans moyens et larges */}
            <table className="hidden w-full text-sm md:table">
              <thead className="border-y border-slate-200 bg-slate-50 text-left text-xs font-medium tracking-wide text-slate-500 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5">Idée</th>
                  <th scope="col" className="px-4 py-2.5">Thème</th>
                  <th scope="col" className="px-4 py-2.5">Dépôt</th>
                  <th scope="col" className="px-4 py-2.5">Statut</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Score</th>
                  <th scope="col" className="w-8 px-2 py-2.5"><span className="sr-only">Ouvrir</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((idea) => {
                  const duplicates = duplicatesOf(idea.id).length;
                  const selected = idea.id in workspace.shortlist;
                  return (
                    <tr
                      key={idea.id}
                      className="group cursor-pointer hover:bg-slate-50"
                      onClick={() => navigate(`/idees/${idea.id}`, { state: backState })}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-400">{idea.id}</span>
                          {selected && <Star className="size-3.5 fill-amber-400 text-amber-400" aria-label="Dans la shortlist" />}
                          {duplicates > 0 && <Tag tone="warning"><Copy className="size-3" aria-hidden />Doublon ?</Tag>}
                        </div>
                        <Link to={`/idees/${idea.id}`} state={backState} className="mt-0.5 block font-medium text-ink-900 group-hover:text-accent-600" onClick={(event) => event.stopPropagation()}>
                          {idea.title}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {idea.direction ?? 'Direction non renseignée'} · {idea.site ?? 'Site non renseigné'}
                        </p>
                      </td>
                      <td className="px-4 py-3">{idea.theme ? <Tag>{idea.theme}</Tag> : <span className="text-xs text-slate-400">Non renseigné</span>}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-slate-600 tabular-nums">{formatDate(idea.submittedAt, idea.submittedAtRaw)}</td>
                      <td className="px-4 py-3"><StatusBadge status={evaluationStatus(workspace, idea.id)} /></td>
                      <td className="px-4 py-3 text-right"><ScoreValue score={finalScore(workspace.evaluations[idea.id])} /></td>
                      <td className="px-2 py-3 text-slate-300 group-hover:text-slate-500"><ChevronRight className="size-4" aria-hidden /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Cartes — mobile */}
            <ul className="divide-y divide-slate-100 border-t border-slate-200 md:hidden">
              {visible.map((idea) => (
                <li key={idea.id}>
                  <Link to={`/idees/${idea.id}`} state={backState} className="block px-4 py-3 active:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-400">{idea.id}</span>
                      <ScoreValue score={finalScore(workspace.evaluations[idea.id])} />
                    </div>
                    <p className="mt-0.5 font-medium text-ink-900">{idea.title}</p>
                    <p className="text-xs text-slate-500">{idea.direction ?? '—'} · {idea.site ?? '—'} · {formatDate(idea.submittedAt, idea.submittedAtRaw)}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <StatusBadge status={evaluationStatus(workspace, idea.id)} />
                      {idea.theme && <Tag>{idea.theme}</Tag>}
                      {duplicatesOf(idea.id).length > 0 && <Tag tone="warning">Doublon ?</Tag>}
                      {idea.id in workspace.shortlist && <Tag tone="accent">Shortlist</Tag>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </>
  );
}
