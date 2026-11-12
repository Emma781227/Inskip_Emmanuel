import {
  AlertTriangle,
  ArrowLeft,
  Copy,
  FileQuestion,
  Loader2,
  RotateCcw,
  Sparkles,
  Star,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { DataGate } from '../components/DataGate';
import { ScoreSelector } from '../components/ScoreSelector';
import { EmptyState, Notice, ScoreValue, StatusBadge, Tag, formatDate, formatDateTime } from '../components/ui';
import { averageScore, evaluationStatus, isCompleteCriteria } from '../domain/scoring';
import {
  CRITERIA,
  CRITERION_HELP,
  CRITERION_LABELS,
  type AiSuggestion,
  type HumanEvaluation,
  type Idea,
  type Score,
  type ScoreCriteria,
} from '../domain/types';
import { useAppStore } from '../state/AppStore';

export function IdeaDetailPage() {
  return (
    <DataGate>
      <IdeaDetail />
    </DataGate>
  );
}

function BackLink() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return (
    <Link to={from ?? '/'} className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-ink-900">
      <ArrowLeft className="size-4" aria-hidden />
      Retour aux idées
    </Link>
  );
}

function IdeaDetail() {
  const { ideaId = '' } = useParams();
  const { ideasById, workspace, toggleShortlist, shortlistPending } = useAppStore();
  const idea = ideasById.get(ideaId);

  if (!idea) {
    return (
      <>
        <BackLink />
        <div className="card">
          <EmptyState icon={FileQuestion} title="Idée introuvable" action={<Link to="/" className="btn-primary">Voir toutes les idées</Link>}>
            Aucune idée ne porte l'identifiant « {ideaId} ».
          </EmptyState>
        </div>
      </>
    );
  }

  const evaluation = workspace.evaluations[idea.id];
  const suggestion = workspace.aiSuggestions[idea.id];
  const selected = idea.id in workspace.shortlist;

  return (
    <>
      <BackLink />
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-400">{idea.id}</span>
            <StatusBadge status={evaluationStatus(workspace, idea.id)} />
            {idea.theme ? <Tag>{idea.theme}</Tag> : <Tag tone="warning">Thème non renseigné</Tag>}
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-900">{idea.title}</h1>
        </div>
        <button
          type="button"
          onClick={() => toggleShortlist(idea.id)}
          disabled={shortlistPending.has(idea.id)}
          className={selected ? 'btn border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100' : 'btn-secondary'}
          aria-pressed={selected}
        >
          <Star className={`size-4 ${selected ? 'fill-amber-400 text-amber-500' : ''}`} aria-hidden />
          {selected ? 'Retenue pour le jury' : 'Retenir pour le jury'}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <IdeaContent idea={idea} />
          <EvaluationPanel
            key={`${idea.id}:${evaluation?.updatedAt ?? 'none'}`}
            idea={idea}
            evaluation={evaluation}
            suggestion={suggestion}
          />
        </div>
        <aside className="space-y-6">
          <ScoreSummary evaluation={evaluation} suggestion={suggestion} />
          <IdeaFacts idea={idea} />
          <DuplicatesCard ideaId={idea.id} />
        </aside>
      </div>
    </>
  );
}

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3">
        <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function IdeaContent({ idea }: { idea: Idea }) {
  return (
    <Section title="L'idée">
      <h3 className="label">Description</h3>
      <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">{idea.description || 'Aucune description.'}</p>
      <h3 className="label mt-5">Bénéfices attendus</h3>
      {idea.expectedBenefits ? (
        <p className="text-sm leading-relaxed text-slate-700">{idea.expectedBenefits}</p>
      ) : (
        <p className="text-sm text-orange-700 italic">Non renseignés par l'auteur.</p>
      )}
    </Section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{children}</dd>
    </div>
  );
}

const missing = <span className="font-normal text-slate-400 italic">Non renseigné</span>;

function IdeaFacts({ idea }: { idea: Idea }) {
  return (
    <Section title="Informations">
      <dl className="-my-2 divide-y divide-slate-100">
        <Fact label="Porteur">{`${idea.author.firstName} ${idea.author.lastName}`.trim() || missing}</Fact>
        <Fact label="Direction">{idea.direction ?? missing}</Fact>
        <Fact label="Site">{idea.site ?? missing}</Fact>
        <Fact label="Déposée le">{formatDate(idea.submittedAt, idea.submittedAtRaw)}</Fact>
        <Fact label="Budget saisi">{idea.budgetRaw ? `« ${idea.budgetRaw} »` : missing}</Fact>
        <Fact label="Budget estimé">
          {idea.budgetEstimateEur !== null ? `${idea.budgetEstimateEur.toLocaleString('fr-FR')} €` : <span className="font-normal text-slate-400 italic">Non chiffrable</span>}
        </Fact>
      </dl>
    </Section>
  );
}

function ScoreSummary({ evaluation, suggestion }: { evaluation: HumanEvaluation | undefined; suggestion: AiSuggestion | undefined }) {
  return (
    <section className="card p-5">
      <p className="text-xs font-medium text-slate-500">Score final</p>
      <div className="mt-1 flex items-baseline gap-3">
        <ScoreValue size="lg" score={evaluation ? averageScore(evaluation.scores) : null} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {evaluation
          ? `Moyenne de vos 4 notes · modifiée le ${formatDateTime(evaluation.updatedAt)}`
          : 'Pas encore validé. Le score final ne prend en compte que vos notes, jamais celles de l’IA seule.'}
      </p>
      {suggestion && (
        <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
          Proposition IA : <span className="font-medium text-slate-700">{averageScore(suggestion.scores).toLocaleString('fr-FR')}/5</span> (indicatif)
        </p>
      )}
    </section>
  );
}

function DuplicatesCard({ ideaId }: { ideaId: string }) {
  const { duplicatesOf, ideasById } = useAppStore();
  const location = useLocation();
  const duplicates = duplicatesOf(ideaId);
  return (
    <Section title="Doublons potentiels">
      {duplicates.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune idée proche détectée.</p>
      ) : (
        <ul className="space-y-3">
          {duplicates.map((candidate) => {
            const other = ideasById.get(candidate.otherIdeaId);
            if (!other) return null;
            return (
              <li key={candidate.otherIdeaId}>
                <Link
                  to={`/idees/${other.id}`}
                  state={location.state}
                  className="block rounded-lg border border-orange-200 bg-orange-50/50 p-3 hover:border-orange-300"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono text-slate-500">{other.id}</span>
                    <Tag tone="warning">
                      <Copy className="size-3" aria-hidden />
                      {candidate.reason === 'identical-title' ? 'Titre identique' : `Similarité ${Math.round(candidate.similarity * 100)} %`}
                    </Tag>
                  </div>
                  <p className="mt-1 text-sm font-medium text-ink-900">{other.title}</p>
                  <p className="text-xs text-slate-500">
                    {other.author.firstName} {other.author.lastName} · {other.site ?? 'site non renseigné'}
                  </p>
                </Link>
              </li>
            );
          })}
          <li className="text-xs text-slate-500">Rapprochement par mots communs : à confirmer. Aucune idée n'est fusionnée automatiquement.</li>
        </ul>
      )}
    </Section>
  );
}

type Draft = Partial<ScoreCriteria>;

function EvaluationPanel({
  idea,
  evaluation,
  suggestion,
}: {
  idea: Idea;
  evaluation: HumanEvaluation | undefined;
  suggestion: AiSuggestion | undefined;
}) {
  const { saveEvaluation, deleteEvaluation, generateAiSuggestion, aiPending } = useAppStore();
  const [draft, setDraft] = useState<Draft>(() => (evaluation ? { ...evaluation.scores } : {}));
  const [comment, setComment] = useState(evaluation?.comment ?? '');
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const pending = aiPending.has(idea.id);

  const complete = isCompleteCriteria(draft);
  const dirty =
    CRITERIA.some((key) => draft[key] !== evaluation?.scores[key]) || comment.trim() !== (evaluation?.comment ?? '');
  const filledCount = CRITERIA.filter((key) => draft[key] !== undefined).length;

  const applyAi = () => {
    if (!suggestion) return;
    setDraft({ ...suggestion.scores });
    setShowErrors(false);
  };
  const cancel = () => {
    setDraft(evaluation ? { ...evaluation.scores } : {});
    setComment(evaluation?.comment ?? '');
    setShowErrors(false);
  };
  const submit = async () => {
    if (!complete) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    // En cas de succès, le panneau est remonté (clé = date de modification) ; sinon le brouillon est conservé.
    const ok = await saveEvaluation(idea.id, draft, comment);
    if (!ok) setSaving(false);
  };

  return (
    <Section
      title="Évaluation"
      actions={
        <button type="button" className="btn-secondary py-1.5" onClick={() => generateAiSuggestion(idea.id)} disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {pending ? 'Analyse…' : suggestion ? 'Relancer l’IA' : 'Proposer une note IA'}
        </button>
      }
    >
      {suggestion ? (
        <div className="mb-5 space-y-3">
          <Notice title={suggestion.summary}>
            {suggestion.simulated ? (
              <>
                Proposition de la <strong>simulation (règles déterministes)</strong>, générée le {formatDateTime(suggestion.generatedAt)}. Ce n'est pas
                l'analyse d'un modèle de langage : vérifiez et corrigez chaque note.
              </>
            ) : (
              <>
                Proposition d'un <strong>modèle de langage</strong> ({suggestion.provider}), générée le {formatDateTime(suggestion.generatedAt)}. Le
                modèle peut se tromper : vérifiez et corrigez chaque note.
              </>
            )}
          </Notice>
          {suggestion.warnings.length > 0 && (
            <Notice tone="warning" title="Informations insuffisantes">
              <ul className="list-disc pl-4">
                {suggestion.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Notice>
          )}
        </div>
      ) : (
        <p className="mb-5 text-sm text-slate-500">
          Notez directement chaque critère de 1 (faible) à 5 (fort), ou demandez d'abord une proposition à l'IA.
        </p>
      )}

      <div className="divide-y divide-slate-100">
        {CRITERIA.map((key) => {
          const missingScore = showErrors && draft[key] === undefined;
          return (
            <div key={key} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-start">
              <div>
                <p className="text-sm font-medium text-ink-900">{CRITERION_LABELS[key]}</p>
                <p className="text-xs text-slate-500">{CRITERION_HELP[key]}</p>
                {suggestion && (
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    <span className="mr-1 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                      IA : {suggestion.scores[key]}/5
                    </span>
                    {suggestion.justifications[key]}
                  </p>
                )}
                {missingScore && <p className="mt-1 text-xs font-medium text-red-600">Choisissez une note pour ce critère.</p>}
              </div>
              <ScoreSelector
                label={CRITERION_LABELS[key]}
                value={draft[key]}
                aiValue={suggestion?.scores[key]}
                onChange={(value: Score) => setDraft((current) => ({ ...current, [key]: value }))}
              />
            </div>
          );
        })}
      </div>

      <label className="mt-2 block">
        <span className="label">Votre justification (incluse dans l'export)</span>
        <textarea
          className="field min-h-24"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="Points forts, réserves, questions à poser au porteur…"
          maxLength={2000}
        />
      </label>

      <div className="mt-4 flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {suggestion && (
            <button type="button" className="btn-ghost" onClick={applyAi}>
              <Wand2 className="size-4" aria-hidden />
              Reprendre les notes IA
            </button>
          )}
          {dirty && (
            <button type="button" className="btn-ghost" onClick={cancel}>
              <RotateCcw className="size-4" aria-hidden />
              Annuler les modifications
            </button>
          )}
          {evaluation && !dirty && (
            <button type="button" className="btn-ghost text-red-600 hover:bg-red-50" onClick={() => deleteEvaluation(idea.id)}>
              <Trash2 className="size-4" aria-hidden />
              Effacer mon évaluation
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">
            {complete ? (
              <>
                Moyenne : <ScoreValue score={averageScore(draft)} />
              </>
            ) : (
              `${filledCount}/4 critères notés`
            )}
          </span>
          <button type="button" className="btn-primary" onClick={submit} disabled={saving || (!dirty && !!evaluation)}>
            {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {saving ? 'Enregistrement…' : evaluation ? (dirty ? 'Enregistrer les modifications' : 'Évaluation enregistrée') : 'Valider l’évaluation'}
          </button>
        </div>
      </div>
      {showErrors && !complete && (
        <p className="mt-2 flex items-center gap-1 text-xs text-red-600" role="alert">
          <AlertTriangle className="size-3.5" aria-hidden /> Les quatre critères doivent être notés avant validation.
        </p>
      )}
    </Section>
  );
}
