import { Box, Wind } from 'lucide-react';
import type { CovidEvent } from '../../../data/covidEvents';
import type { SerraPassage } from '../types/serraPassage';

interface DataMemorialPanelProps {
  readonly passage: SerraPassage;
  readonly currentEvent: CovidEvent | null;
  readonly currentEventDateLabel: string;
  readonly showExperimental3D: boolean;
  readonly onOpenExperimental3D?: () => void;
}

export const DataMemorialPanel = ({
  passage,
  currentEvent,
  currentEventDateLabel,
  showExperimental3D,
  onOpenExperimental3D,
}: DataMemorialPanelProps) => (
  <article className={`serra25d__panel serra25d__panel--${passage.mortalityTone}`}>
    <p className="serra25d__eyebrow">
      <Wind aria-hidden="true" />
      <span>Registro Historico</span>
    </p>

    {currentEvent ? <p className="serra25d__event-date">{currentEventDateLabel}</p> : null}
    <h1>{currentEvent?.title ?? passage.title}</h1>
    <p>{currentEvent?.description ?? passage.subtitle}</p>

    <dl>
      <div>
        <dt>Período</dt>
        <dd>{passage.dateRangeLabel}</dd>
      </div>
      <div>
        <dt>Contaminação</dt>
        <dd>{passage.casesLabel}</dd>
      </div>
      <div>
        <dt>Mortes</dt>
        <dd>{passage.deathsLabel}</dd>
      </div>
    </dl>

    {showExperimental3D && onOpenExperimental3D ? (
      <button
        type="button"
        className="serra25d__experimental"
        onClick={onOpenExperimental3D}
        title="Abrir modo 3D experimental"
      >
        <Box aria-hidden="true" />
        <span>3D</span>
      </button>
    ) : null}
  </article>
);
