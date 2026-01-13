import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Info, PlayCircle, TextQuote } from 'lucide-react';
import { useMemo } from 'react';
import { covidEvents, covidEventsByDate } from '../data/covidEvents';
import { useCovidStore } from '../stores/covidStore';

export const EventCard = () => {
  const { data, currentDateIndex } = useCovidStore();

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
          className="pointer-events-none absolute bottom-28 left-1/2 z-10 w-[min(94vw,400px)] -translate-x-1/2 sm:bottom-6 sm:left-6 sm:translate-x-0"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="pointer-events-auto max-h-[72vh] space-y-2 overflow-auto rounded-2xl border border-white/20 bg-black/85 p-3.5 text-white shadow-2xl backdrop-blur-md sm:max-h-[78vh] lg:max-h-none lg:overflow-visible">
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
                      return (
                        <div key={idx} className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
                          {attachment.url && (
                            <img
                              src={attachment.url}
                              alt={attachment.label ?? 'Imagem histórica'}
                              className="h-36 w-full object-cover"
                              loading="lazy"
                            />
                          )}
                          {attachment.label && (
                            <p className="px-2 py-1 text-[12px] text-white/65">{attachment.label}</p>
                          )}
                        </div>
                      );
                    case 'video':
                      return (
                        <div key={idx} className="overflow-hidden rounded-lg border border-white/10 bg-white/5">
                          {attachment.url?.includes('youtube.com') ? (
                            <div className="aspect-video w-full">
                              <iframe
                                className="h-full w-full"
                                src={attachment.url}
                                title={attachment.label ?? 'Vídeo histórico'}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                              />
                            </div>
                          ) : attachment.url ? (
                            <video className="h-36 w-full object-cover" controls src={attachment.url} />
                          ) : null}
                          {attachment.label && (
                            <p className="flex items-center gap-2 px-2 py-1 text-[12px] text-white/65">
                              <PlayCircle className="h-4 w-4 text-amber-200" />
                              {attachment.label}
                            </p>
                          )}
                        </div>
                      );
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

export default EventCard;
