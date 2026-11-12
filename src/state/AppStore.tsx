/**
 * État applicatif : session Supabase, chargement des données, actions et retours utilisateur.
 * La logique métier vit dans src/domain, la persistance dans src/data ; ce module orchestre.
 * Les écritures sont « pessimistes » : l'état local n'est mis à jour qu'après confirmation
 * du serveur, pour ne jamais afficher comme enregistrée une note qui ne l'est pas.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createAiProvider } from '../ai/config';
import { CsvImportError, parseIdeasCsv } from '../data/csv';
import { RepositoryError, SupabaseRepository, type IdeaPilotRepository } from '../data/repository';
import { supabase } from '../data/supabaseClient';
import { findDuplicatePairs, indexDuplicates } from '../domain/duplicates';
import { isCompleteCriteria } from '../domain/scoring';
import { emptyWorkspace, type DuplicateCandidate, type Idea, type ScoreCriteria, type WorkspaceState } from '../domain/types';
import { recordAiSuggestion, recordAiSuggestions, removeFromShortlist, removeHumanEvaluation } from '../domain/workspace';

export type AuthState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'not-member'; email: string }
  | { status: 'signed-in'; email: string; userId: string };

type LoadState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready' };

export type ToastTone = 'success' | 'error' | 'info';
export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface AppStore {
  auth: AuthState;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  load: LoadState;
  ideas: Idea[];
  ideasById: Map<string, Idea>;
  workspace: WorkspaceState;
  duplicatesOf: (ideaId: string) => DuplicateCandidate[];
  duplicatePairCount: number;
  aiProviderLabel: string;
  aiPending: ReadonlySet<string>;
  /** Écritures en cours (indicateur « Enregistrement… »). */
  savingCount: number;
  shortlistPending: ReadonlySet<string>;
  importing: boolean;
  importWarnings: string[];
  generateAiSuggestion: (ideaId: string) => Promise<void>;
  generateAllAiSuggestions: () => Promise<void>;
  saveEvaluation: (ideaId: string, scores: Partial<Record<keyof ScoreCriteria, unknown>>, comment: string) => Promise<boolean>;
  deleteEvaluation: (ideaId: string) => Promise<void>;
  toggleShortlist: (ideaId: string) => Promise<void>;
  importCsvFile: (file: File) => Promise<void>;
  retryLoad: () => void;
  toasts: Toast[];
  notify: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: number) => void;
}

const StoreContext = createContext<AppStore | null>(null);

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof RepositoryError || error instanceof CsvImportError) return error.message;
  return fallback;
}

function withItem<T>(set: ReadonlySet<T>, item: T, present: boolean): ReadonlySet<T> {
  const next = new Set(set);
  if (present) next.add(item);
  else next.delete(item);
  return next;
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [repository] = useState<IdeaPilotRepository | null>(() => (supabase ? new SupabaseRepository(supabase) : null));
  const [aiProvider] = useState(() => createAiProvider());
  const [auth, setAuth] = useState<AuthState>({ status: 'checking' });
  const [load, setLoad] = useState<LoadState>({ status: 'idle' });
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyWorkspace);
  const [aiPending, setAiPending] = useState<ReadonlySet<string>>(new Set());
  const [shortlistPending, setShortlistPending] = useState<ReadonlySet<string>>(new Set());
  const [savingCount, setSavingCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const toastId = useRef(0);

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    toastId.current += 1;
    const id = toastId.current;
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), tone === 'error' ? 7000 : 4000);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  /** Encadre une écriture : compteur « Enregistrement… » et message d'erreur lisible. */
  const persist = useCallback(
    async <T,>(operation: () => Promise<T>, failure: string): Promise<T | undefined> => {
      setSavingCount((count) => count + 1);
      try {
        return await operation();
      } catch (error) {
        notify(errorMessage(error, failure), 'error');
        return undefined;
      } finally {
        setSavingCount((count) => count - 1);
      }
    },
    [notify],
  );

  // --- Session et appartenance à l'équipe ---------------------------------------------
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let cancelled = false;

    const resolve = async (user: { id: string; email?: string } | null) => {
      if (!user) {
        if (!cancelled) setAuth({ status: 'signed-out' });
        return;
      }
      const { data, error } = await client.from('team_members').select('user_id').eq('user_id', user.id).maybeSingle();
      if (cancelled) return;
      const email = user.email ?? '';
      setAuth(error || !data ? { status: 'not-member', email } : { status: 'signed-in', email, userId: user.id });
    };

    client.auth.getSession().then(({ data }) => resolve(data.session?.user ?? null));
    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      // Différé : on ne doit pas appeler Supabase de façon synchrone dans ce callback.
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        window.setTimeout(() => resolve(session?.user ?? null), 0);
      }
    });
    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Application non configurée.';
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (!error) return null;
    if (/invalid login credentials/i.test(error.message)) return 'Adresse e-mail ou mot de passe incorrect.';
    if (/email not confirmed/i.test(error.message)) return 'Adresse e-mail non confirmée.';
    return 'Connexion impossible pour le moment. Réessayez dans un instant.';
  }, []);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setIdeas([]);
    setWorkspace(emptyWorkspace());
    setLoad({ status: 'idle' });
  }, []);

  // --- Chargement des données --------------------------------------------------------
  const signedInUser = auth.status === 'signed-in' ? auth.userId : null;
  useEffect(() => {
    if (!repository || !signedInUser) return;
    let cancelled = false;
    setLoad({ status: 'loading' });
    repository
      .loadAll()
      .then((data) => {
        if (cancelled) return;
        setIdeas(data.ideas);
        setWorkspace(data.workspace);
        setLoad({ status: 'ready' });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: errorMessage(error, 'Impossible de charger les idées. Vérifiez votre connexion puis réessayez.') });
      });
    return () => {
      cancelled = true;
    };
  }, [repository, signedInUser, reloadToken]);

  const retryLoad = useCallback(() => setReloadToken((token) => token + 1), []);

  const ideasById = useMemo(() => new Map(ideas.map((idea) => [idea.id, idea])), [ideas]);
  const duplicatePairs = useMemo(() => findDuplicatePairs(ideas), [ideas]);
  const duplicateIndex = useMemo(() => indexDuplicates(duplicatePairs), [duplicatePairs]);
  const duplicatesOf = useCallback((ideaId: string) => duplicateIndex.get(ideaId) ?? [], [duplicateIndex]);

  // --- Actions -------------------------------------------------------------------------
  const generateAiSuggestion = useCallback(
    async (ideaId: string) => {
      const idea = ideasById.get(ideaId);
      if (!idea || !repository) return;
      setAiPending((set) => withItem(set, ideaId, true));
      const suggestion = await persist(async () => {
        const result = await aiProvider.suggest(idea);
        await repository.saveAiSuggestions([result]);
        return result;
      }, "La proposition de l'IA n'a pas pu être enregistrée.");
      if (suggestion) setWorkspace((state) => recordAiSuggestion(state, suggestion));
      setAiPending((set) => withItem(set, ideaId, false));
    },
    [aiProvider, ideasById, repository, persist],
  );

  const generateAllAiSuggestions = useCallback(async () => {
    if (!repository) return;
    const targets = ideas.filter((idea) => !workspace.aiSuggestions[idea.id]);
    if (targets.length === 0) {
      notify('Toutes les idées ont déjà une proposition IA.', 'info');
      return;
    }
    setAiPending(new Set(targets.map((idea) => idea.id)));
    const suggestions = await persist(async () => {
      const results = await Promise.all(targets.map((idea) => aiProvider.suggest(idea)));
      await repository.saveAiSuggestions(results);
      return results;
    }, "Les propositions de l'IA n'ont pas pu être enregistrées.");
    if (suggestions) {
      setWorkspace((state) => recordAiSuggestions(state, suggestions));
      notify(`${suggestions.length} propositions IA enregistrées. Vos évaluations existantes sont inchangées.`);
    }
    setAiPending(new Set());
  }, [aiProvider, ideas, workspace.aiSuggestions, repository, persist, notify]);

  const saveEvaluation = useCallback(
    async (ideaId: string, scores: Partial<Record<keyof ScoreCriteria, unknown>>, comment: string) => {
      if (!repository) return false;
      if (!isCompleteCriteria(scores)) {
        notify('Chaque critère doit recevoir une note entière de 1 à 5.', 'error');
        return false;
      }
      const clean: ScoreCriteria = { impact: scores.impact, feasibility: scores.feasibility, alignment: scores.alignment, innovation: scores.innovation };
      const saved = await persist(() => repository.saveEvaluation(ideaId, clean, comment), "L'évaluation n'a pas pu être enregistrée.");
      if (!saved) return false;
      setWorkspace((state) => ({ ...state, evaluations: { ...state.evaluations, [ideaId]: saved } }));
      notify('Évaluation enregistrée.');
      return true;
    },
    [repository, persist, notify],
  );

  const deleteEvaluation = useCallback(
    async (ideaId: string) => {
      if (!repository) return;
      const done = await persist(async () => {
        await repository.deleteEvaluation(ideaId);
        return true;
      }, "L'évaluation n'a pas pu être effacée.");
      if (!done) return;
      setWorkspace((state) => removeHumanEvaluation(state, ideaId));
      notify('Évaluation effacée. La proposition IA est conservée.', 'info');
    },
    [repository, persist, notify],
  );

  const toggleShortlist = useCallback(
    async (ideaId: string) => {
      if (!repository || shortlistPending.has(ideaId)) return;
      const wasSelected = ideaId in workspace.shortlist;
      setShortlistPending((set) => withItem(set, ideaId, true));
      if (wasSelected) {
        const done = await persist(async () => {
          await repository.removeFromShortlist(ideaId);
          return true;
        }, 'La shortlist n’a pas pu être mise à jour.');
        if (done) {
          setWorkspace((state) => removeFromShortlist(state, ideaId));
          notify(`${ideaId} retirée de la shortlist.`, 'info');
        }
      } else {
        const selection = await persist(() => repository.addToShortlist(ideaId), 'La shortlist n’a pas pu être mise à jour.');
        if (selection) {
          setWorkspace((state) => ({ ...state, shortlist: { ...state.shortlist, [ideaId]: selection } }));
          notify(`${ideaId} ajoutée à la shortlist.`);
        }
      }
      setShortlistPending((set) => withItem(set, ideaId, false));
    },
    [repository, workspace.shortlist, shortlistPending, persist, notify],
  );

  const importCsvFile = useCallback(
    async (file: File) => {
      if (!repository) return;
      setImporting(true);
      try {
        const { ideas: parsed, warnings } = parseIdeasCsv(await file.text());
        const known = new Set(ideas.map((idea) => idea.id));
        const added = parsed.filter((idea) => !known.has(idea.id)).length;
        const count = await persist(() => repository.importIdeas(parsed), 'L’import n’a pas pu être enregistré.');
        if (count !== undefined) {
          setImportWarnings(warnings);
          notify(`${count} idées importées depuis ${file.name} : ${added} nouvelle${added > 1 ? 's' : ''}, ${count - added} mise${count - added > 1 ? 's' : ''} à jour.`);
          retryLoad();
        }
      } catch (error) {
        notify(errorMessage(error, 'Le fichier n’a pas pu être lu.'), 'error');
      } finally {
        setImporting(false);
      }
    },
    [repository, ideas, persist, notify, retryLoad],
  );

  const value: AppStore = {
    auth,
    signIn,
    signOut,
    load,
    ideas,
    ideasById,
    workspace,
    duplicatesOf,
    duplicatePairCount: duplicatePairs.length,
    aiProviderLabel: aiProvider.label,
    aiPending,
    savingCount,
    shortlistPending,
    importing,
    importWarnings,
    generateAiSuggestion,
    generateAllAiSuggestions,
    saveEvaluation,
    deleteEvaluation,
    toggleShortlist,
    importCsvFile,
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
