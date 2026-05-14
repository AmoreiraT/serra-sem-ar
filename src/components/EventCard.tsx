import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Info, PlayCircle, TextQuote } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  formatCovidEventDatePtBr,
  getCovidEventForTimelineIndex,
  type CovidEventAttachment,
} from '../data/covidEvents';
import { useCovidStore } from '../stores/covidStore';

type EventCardLayout = 'floating' | 'sheet' | 'mobile' | 'tablet';

interface EventCardProps {
  layout?: EventCardLayout;
  className?: string;
  onExpand?: () => void;
}

export const EventCard = ({ layout = 'floating', className, onExpand }: EventCardProps = {}) => {
  const { data, currentDateIndex } = useCovidStore();
  const isSheet = layout === 'sheet';
  const isMobileCompact = layout === 'mobile';
  const isTabletPopover = layout === 'tablet';
  const isExpandedView = isSheet || isTabletPopover || !isMobileCompact;

  const event = useMemo(() => getCovidEventForTimelineIndex(data, currentDateIndex), [currentDateIndex, data]);
  const formattedDate = useMemo(() => {
    if (!event) return '';
    return formatCovidEventDatePtBr(event.date);
  }, [event]);
  const visibleAttachments = useMemo(() => {
    if (!event?.attachments?.length) return [];
    return isMobileCompact || isTabletPopover ? event.attachments.slice(0, 1) : event.attachments;
  }, [event, isMobileCompact, isTabletPopover]);

  return (
    <AnimatePresence mode="wait">
      {event && (
        <motion.div
          key={event.date}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={cn(
            isSheet
              ? 'w-full'
              : isTabletPopover
                ? 'tablet-event-card pointer-events-none absolute z-20'
                : isMobileCompact
                ? 'hud-mobile-event pointer-events-none absolute xl:hidden'
                : 'desktop-event-card pointer-events-none absolute bottom-6 left-6 z-10 w-[min(32vw,410px)] safe-bottom',
            className
          )}
        >
          <div
            className={cn(
              'pointer-events-auto space-y-2 rounded-2xl border border-white/20 bg-black/85 text-white shadow-2xl backdrop-blur-md',
              isSheet
                ? 'max-h-[60vh] overflow-auto p-3.5'
                : isTabletPopover
                  ? 'tablet-event-card-inner max-h-[42vh] overflow-auto p-3'
                : isMobileCompact
                  ? 'hud-mobile-event-inner overflow-hidden p-2.5'
                  : 'max-h-[72vh] overflow-auto p-3.5 sm:max-h-[78vh] lg:max-h-none lg:overflow-visible'
            )}
          >
            <div className="flex items-center gap-2 text-amber-300">
              <Info className="h-4 w-4 shrink-0" />
              <p
                className={cn(
                  'hud-mobile-event-kicker text-[11px] uppercase',
                  isMobileCompact ? 'text-[10px] tracking-[0.14em]' : 'truncate tracking-[0.35em]',
                  isTabletPopover && 'tracking-[0.24em]'
                )}
              >
                Registro Histórico
              </p>
            </div>
            <div>
              <p
                className={cn(
                  'hud-mobile-event-date text-[11px] text-white/70',
                  isMobileCompact && 'uppercase tracking-[0.12em]'
                )}
              >
                {formattedDate}
              </p>
              <h3
                className={cn(
                  'hud-mobile-event-title break-words text-[15px] font-semibold leading-snug',
                  isMobileCompact && 'line-clamp-2 text-[13px] leading-[1.22]',
                  isTabletPopover && 'text-[15px] leading-tight'
                )}
              >
                {event.title}
              </h3>
            </div>

            {isExpandedView ? (
              <p
                className={cn(
                  'break-words text-[12px] leading-relaxed text-white/85',
                  isMobileCompact && 'mobile-event-description',
                  isTabletPopover && 'tablet-event-description'
                )}
              >
                {event.description}
              </p>
            ) : (
              <button
                type="button"
                onClick={onExpand}
                className="hud-mobile-event-cta inline-flex w-full items-center justify-center rounded-xl border border-amber-200/35 bg-amber-300/12 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-amber-100 transition hover:bg-amber-300/20"
              >
                Abrir registro
              </button>
            )}

            {isExpandedView && visibleAttachments.length ? (
              <div className="space-y-2">
                {visibleAttachments.map((attachment, idx) => {
                  switch (attachment.type) {
                    case 'text':
                      return (
                        <div
                          key={idx}
                          className={cn(
                            'rounded-lg border border-white/10 bg-white/5 p-2 text-[12px] leading-snug text-white/80',
                            isMobileCompact && 'mobile-event-description'
                          )}
                        >
                          <div className="mb-1 flex items-center gap-2 text-amber-200">
                            <TextQuote className="h-4 w-4" />
                            <span>Citação</span>
                          </div>
                          <p>{attachment.content}</p>
                        </div>
                      );
                    case 'image':
                      return <HistoricalImage key={idx} attachment={attachment} compact={isMobileCompact} />;
                    case 'video':
                      return <HistoricalVideo key={idx} attachment={attachment} compact={isMobileCompact} />;
                    case 'link':
                    default:
                      return (
                        <a
                          key={idx}
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-amber-200 transition-colors hover:text-amber-100"
                        >
                          <span className="min-w-0 truncate">{attachment.label ?? 'Abrir referência'}</span>
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      );
                  }
                })}
              </div>
            ) : null}

            {isExpandedView && event.source && (
              <a
                href={event.source}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-2 text-[12px] text-amber-200 transition-colors hover:text-amber-100"
              >
                <ExternalLink className="h-4 w-4" />
                <span className="min-w-0 truncate">Fonte oficial</span>
              </a>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const getYoutubeVideoId = (url?: string) => {
  if (!url) return null;
  const patterns = [
    /youtube\.com\/embed\/([^?&#/]+)/i,
    /youtube\.com\/watch\?v=([^?&#/]+)/i,
    /youtu\.be\/([^?&#/]+)/i,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
};

const HistoricalImage = ({
  attachment,
  compact = false,
}: {
  attachment: CovidEventAttachment;
  compact?: boolean;
}) => {
  const [hasError, setHasError] = useState(false);

  if (!attachment.url || hasError) {
    return (
      <MediaFallback
        label={attachment.label ?? 'Imagem histórica'}
        url={attachment.url}
        message="Imagem indisponível"
      />
    );
  }

  return (
    <div className="hud-mobile-event-media overflow-hidden rounded-lg border border-white/10 bg-white/5">
      <img
        src={attachment.url}
        alt={attachment.label ?? 'Imagem histórica'}
        className={cn(compact ? 'h-24 min-[390px]:h-28' : 'h-36', 'w-full object-cover')}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setHasError(true)}
      />
      {attachment.label && (
        <p className="px-2 py-1 text-[12px] text-white/65">{attachment.label}</p>
      )}
    </div>
  );
};

const HistoricalVideo = ({
  attachment,
  compact = false,
}: {
  attachment: CovidEventAttachment;
  compact?: boolean;
}) => {
  const [hasError, setHasError] = useState(false);
  const youtubeId = getYoutubeVideoId(attachment.url);

  if (youtubeId) {
    const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    const thumbnailUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;

    return (
      <a
        href={watchUrl}
        target="_blank"
        rel="noreferrer"
        className="hud-mobile-event-media group block overflow-hidden rounded-lg border border-white/10 bg-white/5 transition-colors hover:border-amber-200/40"
      >
        <div className={cn('relative w-full bg-white/5', compact ? 'h-24 min-[390px]:h-28' : 'h-36')}>
          {!hasError && (
            <img
              src={thumbnailUrl}
              alt=""
              className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100"
              loading="lazy"
              decoding="async"
              onError={() => setHasError(true)}
            />
          )}
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-400 text-black shadow-lg">
              <PlayCircle className="h-6 w-6" />
            </span>
          </div>
        </div>
        <p className="flex items-center gap-2 px-2 py-1 text-[12px] text-amber-200">
          <ExternalLink className="h-4 w-4" />
          {attachment.label ?? 'Abrir vídeo'}
        </p>
      </a>
    );
  }

  if (!attachment.url || hasError) {
    return (
      <MediaFallback
        label={attachment.label ?? 'Vídeo histórico'}
        url={attachment.url}
        message="Vídeo indisponível"
      />
    );
  }

  return (
    <div className="hud-mobile-event-media overflow-hidden rounded-lg border border-white/10 bg-white/5">
      <video
        className={cn(compact ? 'h-24 min-[390px]:h-28' : 'h-36', 'w-full object-cover')}
        controls
        preload="metadata"
        src={attachment.url}
        onError={() => setHasError(true)}
      />
      {attachment.label && (
        <p className="flex items-center gap-2 px-2 py-1 text-[12px] text-white/65">
          <PlayCircle className="h-4 w-4 text-amber-200" />
          {attachment.label}
        </p>
      )}
    </div>
  );
};

const MediaFallback = ({
  label,
  url,
  message,
}: {
  label: string;
  url?: string;
  message: string;
}) => (
  <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-[12px] text-white/70">
    <p className="font-semibold text-white/85">{message}</p>
    <p className="mt-1">{label}</p>
    {url && (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-2 text-amber-200 transition-colors hover:text-amber-100"
      >
        Abrir fonte
        <ExternalLink className="h-4 w-4" />
      </a>
    )}
  </div>
);

export default EventCard;
