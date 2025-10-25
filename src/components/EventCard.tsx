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

  return (
    <AnimatePresence mode="wait">
      {event && (
        <motion.div
          key={event.date}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="pointer-events-none absolute bottom-6 left-6 max-w-sm"
          style={{ transform: 'scale(0.45)', transformOrigin: 'bottom left' }}
        >
          <div className="pointer-events-auto rounded-xl border border-white/20 bg-black/80 p-2.5 shadow-xl backdrop-blur-md text-white space-y-1.5">
            <div className="flex items-center gap-1.5 text-amber-300">
              <Info className="h-3 w-3" />
              <p className="text-[10px] uppercase tracking-[0.45em]">Registro Histórico</p>
            </div>
            <div>
              <p className="text-[10px] text-white/60">{event.date}</p>
              <h3 className="text-sm font-semibold leading-snug">{event.title}</h3>
            </div>
            <p className="text-[11px] leading-tight text-white/85">{event.description}</p>

            {event.attachments?.length ? (
              <div className="space-y-1.5">
                {event.attachments.map((attachment, idx) => {
                  switch (attachment.type) {
                    case 'text':
                      return (
                        <div key={idx} className="rounded-lg border border-white/10 bg-white/5 p-2 text-[11px] leading-snug text-white/80">
                          <div className="mb-1 flex items-center gap-1.5 text-amber-200">
                            <TextQuote className="h-3 w-3" />
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
                              className="h-32 w-full object-cover"
                              loading="lazy"
                            />
                          )}
                          {attachment.label && (
                            <p className="px-2 py-1 text-[11px] text-white/65">{attachment.label}</p>
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
                            <video className="h-32 w-full object-cover" controls src={attachment.url} />
                          ) : null}
                          {attachment.label && (
                            <p className="px-2 py-1 text-[11px] text-white/65 flex items-center gap-1.5">
                              <PlayCircle className="h-3 w-3 text-amber-200" />
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
                          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-amber-200 hover:text-amber-100 transition-colors"
                        >
                          {attachment.label ?? 'Abrir referência'}
                          <ExternalLink className="h-3 w-3" />
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
                className="inline-flex items-center gap-1.5 text-[11px] text-amber-200 hover:text-amber-100 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
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
