import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="card">
      <EmptyState icon={Compass} title="Page introuvable" action={<Link to="/" className="btn-primary">Retour aux idées</Link>}>
        Le lien que vous avez suivi ne correspond à aucune page d'IdeaPilot.
      </EmptyState>
    </div>
  );
}
