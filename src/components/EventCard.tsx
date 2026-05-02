import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Info, PlayCircle, TextQuote } from 'lucide-react';
import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { covidEvents, covidEventsByDate } from '../data/covidEvents';
import type { CovidEventAttachment } from '../data/covidEvents';
import { useCovidStore } from '../stores/covidStore';

interface EventCardProps {
  layout?: 'floating' | 'sheet';
  className?: string;
}

export const EventCard = ({ layout = 'floating', className }: EventCardProps = {}) => {
  const { data, currentDateIndex } = useCovidStore();
  const isSheet = layout === 'sheet';

  const eventsByIndex = useMemo(() => {
    if (!data.length) return [];

    return covidEvents
      .map((event) => {
        const index = data.findIndex((item) => item.date.toISOString().slice(0, 10) === event.date);
        if (index === -1) return null;
        return { event, index };
      })
      .filter((entry): entry is { event: (typeof covidEvents)[number]; index: number } => entry !== null)
      .sort((a, b) => a.index - b.index);
  }, [data]);

  const event = useMemo(() => {
    if (!eventsByIndex.length) return null;

    const upcoming = eventsByIndex.find((item) => item.index >= currentDateIndex);
    const selected = upcoming ?? eventsByIndex[eventsByIndex.length - 1];
    if (!selected) return null;

    const isoDate = selected.event.date;
    return covidEventsByDate.get(isoDate) ?? selected.event;
  }, [currentDateIndex, eventsByIndex]);
  const formattedDate = useMemo(() => {
    if (!event) return '';
    const safeDate = new Date(`${event.date}T00:00:00`);
    return safeDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }, [event]);

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
              : 'desktop-event-card pointer-events-none absolute bottom-6 left-6 z-10 w-[min(32vw,410px)] safe-bottom',
            className
          )}
        >
          <div
            className={cn(
              'pointer-events-auto space-y-2 overflow-auto rounded-2xl border border-white/20 bg-black/85 p-3.5 text-white shadow-2xl backdrop-blur-md',
              isSheet
                ? 'max-h-[60vh]'
                : 'max-h-[72vh] sm:max-h-[78vh] lg:max-h-none lg:overflow-visible'
            )}
          >
            <div className="flex items-center gap-2 text-amber-300">
              <Info className="h-4 w-4" />
              <p className="text-[11px] uppercase tracking-[0.35em]">Registro Histórico</p>
            </div>
            <div>
              <p className="text-[11px] text-white/70">{formattedDate}</p>
              <h3 className="text-[15px] font-semibold leading-snug">{event.title}</h3>
            </div>
            <p className="text-[12px] leading-relaxed text-white/85">{event.description}</p>

            {event.attachments?.length ? (
              <div className="space-y-2">
                {event.attachments.map((attachment, idx) => {
                  switch (attachment.type) {
                    case 'text':
                      return (
                        <div key={idx} className="rounded-lg border border-white/10 bg-white/5 p-2 text-[12px] leading-snug text-white/80">
                          <div className="mb-1 flex items-center gap-2 text-amber-200">
                            <TextQuote className="h-4 w-4" />
                            <span>Citação</span>
                          </div>
                          <p>{attachment.content}</p>
                        </div>
                      );
                    case 'image':
                      return <HistoricalImage key={idx} attachment={attachment} />;
                    case 'video':
                      return <HistoricalVideo key={idx} attachment={attachment} />;
                    case 'link':
                    default:
                      return (
                        <a
                          key={idx}
                          href={attachment.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-amber-200 transition-colors hover:text-amber-100"
                        >
                          {attachment.label ?? 'Abrir referência'}
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      );
                  }
                })}
              </div>
            ) : null}

            {event.source && (
              <a
                href={event.source}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-[12px] text-amber-200 transition-colors hover:text-amber-100"
              >
                <ExternalLink className="h-4 w-4" />
                Fonte oficial
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

const HistoricalImage = ({ attachment }: { attachment: CovidEventAttachment }) => {
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
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
      <img
        src={attachment.url}
        alt={attachment.label ?? 'Imagem histórica'}
        className="h-36 w-full object-cover"
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

const HistoricalVideo = ({ attachment }: { attachment: CovidEventAttachment }) => {
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
        className="group block overflow-hidden rounded-lg border border-white/10 bg-white/5 transition-colors hover:border-amber-200/40"
      >
        <div className="relative h-36 w-full bg-white/5">
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
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
      <video
        className="h-36 w-full object-cover"
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
