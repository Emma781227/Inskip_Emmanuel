/**
 * État applicatif : chargement des idées, état de travail persistant et actions.
 * La logique métier vit dans src/domain ; ce module ne fait que l'orchestrer.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createAiProvider } from '../ai/config';
import { CsvImportError, parseIdeasCsv } from '../data/csv';
import { createBrowserRepository } from '../data/repository';
import { findDuplicatePairs, indexDuplicates } from '../domain/duplicates';
import { emptyWorkspace, type DuplicateCandidate, type Idea, type ScoreCriteria, type WorkspaceState } from '../domain/types';
import {
  recordAiSuggestion,
  recordAiSuggestions,
  removeHumanEvaluation,
  saveHumanEvaluation,
  toggleShortlist as toggleShortlistTransition,
} from '../domain/workspace';

const DEFAULT_DATASET = { id: 'hexavia-2026', name: 'Challenge innovation Hexavia', url: '/data/idees_hexavia.csv' };
const IMPORTED_DATASET_KEY = 'ideapilot:imported-dataset';

interface Dataset {
  id: string;
  name: string;
  imported: boolean;
}

type LoadState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

export type ToastTone = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface AppStore {
  load: LoadState;
  dataset: Dataset;
  ideas: Idea[];
  ideasById: Map<string, Idea>;
  importWarnings: string[];
  workspace: WorkspaceState;
  persistent: boolean;
  duplicatesOf: (ideaId: string) => DuplicateCandidate[];
  duplicatePairCount: number;
  aiProviderLabel: string;
  aiPending: ReadonlySet<string>;
  generateAiSuggestion: (ideaId: string) => Promise<void>;
  generateAllAiSuggestions: () => Promise<void>;
  saveEvaluation: (ideaId: string, scores: Partial<Record<keyof ScoreCriteria, unknown>>, comment: string) => boolean;
  deleteEvaluation: (ideaId: string) => void;
  toggleShortlist: (ideaId: string) => void;
  importCsvFile: (file: File) => Promise<void>;
  restoreDefaultDataset: () => void;
  retryLoad: () => void;
  toasts: Toast[];
  notify: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

const StoreContext = createContext<AppStore | null>(null);

/** Empreinte courte et stable d'un texte, pour isoler l'état de travail de chaque fichier importé. */
function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36);
}

interface StoredImport {
  name: string;
  text: string;
}

function readStoredImport(): StoredImport | null {
  try {
    const raw = window.localStorage.getItem(IMPORTED_DATASET_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && 'name' in parsed && 'text' in parsed) {
      const { name, text } = parsed as Record<string, unknown>;
      if (typeof name === 'string' && typeof text === 'string') return { name, text };
    }
  } catch {
    // ignoré : on retombe sur le jeu par défaut
  }
  return null;
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [{ repository, persistent }] = useState(createBrowserRepository);
  const [aiProvider] = useState(() => createAiProvider());
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [dataset, setDataset] = useState<Dataset>({ id: DEFAULT_DATASET.id, name: DEFAULT_DATASET.name, imported: false });
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyWorkspace);
  const [aiPending, setAiPending] = useState<ReadonlySet<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const toastId = useRef(0);
  const datasetIdRef = useRef(dataset.id);

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4000);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const activate = useCallback(
    (next: Dataset, nextIdeas: Idea[], warnings: string[]) => {
      datasetIdRef.current = next.id;
      setDataset(next);
      setIdeas(nextIdeas);
      setImportWarnings(warnings);
      setWorkspace(repository.load(next.id));
      setLoad({ status: 'ready' });
    },
    [repository],
  );

  // Chargement initial : fichier importé précédemment, sinon l'export Hexavia fourni.
  useEffect(() => {
    let cancelled = false;
    setLoad({ status: 'loading' });
    (async () => {
      try {
        const stored = readStoredImport();
        if (stored) {
          const { ideas: parsed, warnings } = parseIdeasCsv(stored.text);
          if (!cancelled) activate({ id: `import-${hashText(stored.text)}`, name: stored.name, imported: true }, parsed, warnings);
          return;
        }
        const response = await fetch(DEFAULT_DATASET.url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const { ideas: parsed, warnings } = parseIdeasCsv(await response.text());
        if (!cancelled) activate({ id: DEFAULT_DATASET.id, name: DEFAULT_DATASET.name, imported: false }, parsed, warnings);
      } catch (error) {
        if (cancelled) return;
        const message =
          error instanceof CsvImportError
            ? error.message
            : 'Impossible de charger les idées. Vérifiez votre connexion puis réessayez.';
        setLoad({ status: 'error', message });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activate, reloadToken]);

  /** Applique une transition et persiste immédiatement. */
  const update = useCallback(
    (transition: (state: WorkspaceState) => WorkspaceState) => {
      setWorkspace((current) => {
        const next = transition(current);
        try {
          repository.save(datasetIdRef.current, next);
        } catch {
          notify("L'enregistrement local a échoué (stockage plein ou bloqué).", 'error');
        }
        return next;
      });
    },
    [repository, notify],
  );

  const ideasById = useMemo(() => new Map(ideas.map((idea) => [idea.id, idea])), [ideas]);
  const duplicatePairs = useMemo(() => findDuplicatePairs(ideas), [ideas]);
  const duplicateIndex = useMemo(() => indexDuplicates(duplicatePairs), [duplicatePairs]);
  const duplicatesOf = useCallback((ideaId: string) => duplicateIndex.get(ideaId) ?? [], [duplicateIndex]);

  const setPending = (ids: string[], pending: boolean) =>
    setAiPending((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (pending) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const generateAiSuggestion = useCallback(
    async (ideaId: string) => {
      const idea = ideasById.get(ideaId);
      if (!idea) return;
      setPending([ideaId], true);
      try {
        const suggestion = await aiProvider.suggest(idea);
        update((state) => recordAiSuggestion(state, suggestion));
      } catch {
        notify("La proposition de l'IA n'a pas pu être générée. Réessayez.", 'error');
      } finally {
        setPending([ideaId], false);
      }
    },
    [aiProvider, ideasById, update, notify],
  );

  const generateAllAiSuggestions = useCallback(async () => {
    const targets = ideas.filter((idea) => !workspace.aiSuggestions[idea.id]);
    if (targets.length === 0) {
      notify('Toutes les idées ont déjà une proposition IA.', 'info');
      return;
    }
    const ids = targets.map((idea) => idea.id);
    setPending(ids, true);
    try {
      const suggestions = await Promise.all(targets.map((idea) => aiProvider.suggest(idea)));
      update((state) => recordAiSuggestions(state, suggestions));
      notify(`${suggestions.length} propositions IA générées. Vos évaluations existantes sont inchangées.`);
    } catch {
      notify("Les propositions de l'IA n'ont pas pu être générées. Réessayez.", 'error');
    } finally {
      setPending(ids, false);
    }
  }, [aiProvider, ideas, workspace.aiSuggestions, update, notify]);

  const saveEvaluation = useCallback(
    (ideaId: string, scores: Partial<Record<keyof ScoreCriteria, unknown>>, comment: string) => {
      try {
        // Validation hors du setter : une erreur ne doit pas casser la mise à jour d'état.
        saveHumanEvaluation(emptyWorkspace(), ideaId, scores, comment);
      } catch (error) {
        notify(error instanceof Error ? error.message : 'Évaluation invalide.', 'error');
        return false;
      }
      const now = new Date();
      update((state) => saveHumanEvaluation(state, ideaId, scores, comment, now));
      notify('Évaluation enregistrée.');
      return true;
    },
    [update, notify],
  );

  const deleteEvaluation = useCallback(
    (ideaId: string) => {
      update((state) => removeHumanEvaluation(state, ideaId));
      notify('Évaluation effacée. La proposition IA est conservée.', 'info');
    },
    [update, notify],
  );

  const toggleShortlist = useCallback(
    (ideaId: string) => {
      const wasSelected = ideaId in workspace.shortlist;
      update((state) => toggleShortlistTransition(state, ideaId));
      notify(wasSelected ? `${ideaId} retirée de la shortlist.` : `${ideaId} ajoutée à la shortlist.`, wasSelected ? 'info' : 'success');
    },
    [workspace.shortlist, update, notify],
  );

  const importCsvFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const { ideas: parsed, warnings } = parseIdeasCsv(text);
        try {
          window.localStorage.setItem(IMPORTED_DATASET_KEY, JSON.stringify({ name: file.name, text }));
        } catch {
          notify("Le fichier est chargé mais ne pourra pas être conservé après fermeture de l'onglet.", 'info');
        }
        activate({ id: `import-${hashText(text)}`, name: file.name, imported: true }, parsed, warnings);
        notify(`${parsed.length} idées importées depuis ${file.name}.`);
      } catch (error) {
        notify(error instanceof CsvImportError ? error.message : 'Le fichier n’a pas pu être lu.', 'error');
      }
    },
    [activate, notify],
  );

  const restoreDefaultDataset = useCallback(() => {
    try {
      window.localStorage.removeItem(IMPORTED_DATASET_KEY);
    } catch {
      // stockage indisponible : rien à nettoyer
    }
    setReloadToken((token) => token + 1);
    notify('Retour aux idées du challenge Hexavia.', 'info');
  }, [notify]);

  const retryLoad = useCallback(() => setReloadToken((token) => token + 1), []);

  const value: AppStore = {
    load,
    dataset,
    ideas,
    ideasById,
    importWarnings,
    workspace,
    persistent,
    duplicatesOf,
    duplicatePairCount: duplicatePairs.length,
    aiProviderLabel: aiProvider.label,
    aiPending,
    generateAiSuggestion,
    generateAllAiSuggestions,
    saveEvaluation,
    deleteEvaluation,
    toggleShortlist,
    importCsvFile,
    restoreDefaultDataset,
    retryLoad,
    toasts,
    notify,
    dismissToast,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useAppStore(): AppStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useAppStore doit être utilisé dans <AppStoreProvider>.');
  return store;
}
