import type { Score } from '../domain/types';

const VALUES: Score[] = [1, 2, 3, 4, 5];

/** Sélecteur de note 1 à 5, accessible au clavier (groupe de boutons radio). */
export function ScoreSelector({
  value,
  onChange,
  label,
  aiValue,
}: {
  value: Score | undefined;
  onChange: (value: Score) => void;
  label: string;
  aiValue?: Score;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
      {VALUES.map((score) => {
        const checked = value === score;
        return (
          <button
            key={score}
            type="button"
            role="radio"
            aria-checked={checked}
            title={aiValue === score ? 'Note proposée par l’IA' : undefined}
            onClick={() => onChange(score)}
            className={`relative size-9 rounded-md text-sm font-medium tabular-nums transition-colors ${
              checked ? 'bg-ink-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {score}
            {aiValue === score && !checked && (
              <span className="absolute top-1 right-1 size-1.5 rounded-full bg-amber-400" aria-hidden />
            )}
          </button>
        );
      })}
    </div>
  );
}
