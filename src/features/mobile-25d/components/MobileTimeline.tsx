import type { CovidEventTimelinePoint } from '../../../data/covidEvents';

interface MobileTimelineProps {
  readonly points: readonly CovidEventTimelinePoint[];
  readonly progress: number;
  readonly activeEventDate: string;
  readonly onSeek: (progress: number) => void;
}

export const MobileTimeline = ({ points, progress, activeEventDate, onSeek }: MobileTimelineProps) => (
  <nav
    className="serra25d__timeline"
    aria-label="Linha do tempo da serra"
    data-density={points.length > 16 ? 'dense' : 'default'}
  >
    <div className="serra25d__progress" aria-hidden="true">
      <div style={{ transform: `scaleX(${progress})` }} />
    </div>

    <div className="serra25d__timeline-markers">
      {points.map((point) => (
        <button
          key={point.id}
          type="button"
          className="serra25d__timeline-marker"
          data-active={point.date === activeEventDate}
          style={{ left: `${point.progress * 100}%` }}
          onClick={() => onSeek(point.progress)}
          title={point.date}
          aria-label={point.title}
        />
      ))}
    </div>
  </nav>
);
