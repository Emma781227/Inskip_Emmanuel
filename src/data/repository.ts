/**
 * Persistance de l'état de travail (suggestions IA, évaluations, shortlist).
 * L'application ne connaît que l'interface `WorkspaceRepository` : la V1 stocke dans
 * le navigateur (localStorage) ; une implémentation Supabase pourra la remplacer.
 */
import { emptyWorkspace, type WorkspaceState } from '../domain/types';

export interface WorkspaceRepository {
  load(datasetId: string): WorkspaceState;
  save(datasetId: string, state: WorkspaceState): void;
  clear(datasetId: string): void;
}

const SCHEMA_VERSION = 1;
const KEY_PREFIX = 'ideapilot:workspace:';

interface StoredWorkspace {
  version: number;
  state: WorkspaceState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Vérification minimale de forme, pour ne pas planter sur des données corrompues. */
function isWorkspaceState(value: unknown): value is WorkspaceState {
  return isRecord(value) && isRecord(value.aiSuggestions) && isRecord(value.evaluations) && isRecord(value.shortlist);
}

export class LocalStorageWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {}

  load(datasetId: string): WorkspaceState {
    try {
      const raw = this.storage.getItem(KEY_PREFIX + datasetId);
      if (!raw) return emptyWorkspace();
      const parsed: unknown = JSON.parse(raw);
      if (isRecord(parsed) && parsed.version === SCHEMA_VERSION && isWorkspaceState(parsed.state)) {
        return parsed.state;
      }
    } catch {
      // Stockage indisponible ou JSON corrompu : on repart d'un état vide.
    }
    return emptyWorkspace();
  }

  save(datasetId: string, state: WorkspaceState): void {
    const payload: StoredWorkspace = { version: SCHEMA_VERSION, state };
    this.storage.setItem(KEY_PREFIX + datasetId, JSON.stringify(payload));
  }

  clear(datasetId: string): void {
    this.storage.removeItem(KEY_PREFIX + datasetId);
  }
}

/** Repli en mémoire (navigation privée, stockage bloqué) : rien n'est conservé au rechargement. */
export class InMemoryWorkspaceRepository implements WorkspaceRepository {
  private readonly data = new Map<string, WorkspaceState>();
  load(datasetId: string): WorkspaceState {
    return this.data.get(datasetId) ?? emptyWorkspace();
  }
  save(datasetId: string, state: WorkspaceState): void {
    this.data.set(datasetId, state);
  }
  clear(datasetId: string): void {
    this.data.delete(datasetId);
  }
}

export function createBrowserRepository(): { repository: WorkspaceRepository; persistent: boolean } {
  try {
    const probe = '__ideapilot_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return { repository: new LocalStorageWorkspaceRepository(window.localStorage), persistent: true };
  } catch {
    return { repository: new InMemoryWorkspaceRepository(), persistent: false };
  }
}
