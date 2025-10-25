import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, Info, PlayCircle, TextQuote } from 'lucide-react';
import { useMemo } from 'react';
import { covidEventsByDate } from '../data/covidEvents';
import { useCovidStore } from '../stores/covidStore';

export const EventCard = () => {
  const { data, currentDateIndex } = useCovidStore();

  const event = useMemo(() => {
    if (!data.length) return null;
    const clamped = Math.min(Math.max(currentDateIndex, 0), data.length - 1);
    const current = data[clamped];
    if (!current) return null;
    const isoDate = current.date.toISOString().slice(0, 10);
    return covidEventsByDate.get(isoDate) ?? null;
  }, [data, currentDateIndex]);

  return (
    <AnimatePresence mode="wait">
      {event && (
        <motion.div
          key={event.date}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="pointer-events-none absolute bottom-8 left-8 max-w-md"
        >
          <div className="pointer-events-auto rounded-xl border border-white/20 bg-black/75 p-4 shadow-xl backdrop-blur-md text-white space-y-3">
            <div className="flex items-center gap-2 text-amber-300">
              <Info className="h-5 w-5" />
              <p className="text-sm uppercase tracking-widest">Registro Histórico</p>
            </div>
            <div>
              <p className="text-xs text-white/60">{event.date}</p>
              <h3 className="text-lg font-semibold">{event.title}</h3>
            </div>
            <p className="text-sm leading-relaxed text-white/85">{event.description}</p>

            {event.attachments?.length ? (
              <div className="space-y-3">
                {event.attachments.map((attachment, idx) => {
                  switch (attachment.type) {
                    case 'text':
                      return (
                        <div key={idx} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm leading-relaxed text-white/80">
                          <div className="mb-2 flex items-center gap-2 text-amber-200">
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
                              className="h-40 w-full object-cover"
                              loading="lazy"
                            />
                          )}
                          {attachment.label && (
                            <p className="px-3 py-2 text-xs text-white/65">{attachment.label}</p>
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
                            <video className="h-44 w-full object-cover" controls src={attachment.url} />
                          ) : null}
                          {attachment.label && (
                            <p className="px-3 py-2 text-xs text-white/65 flex items-center gap-2">
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
                          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-amber-200 hover:text-amber-100 transition-colors"
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
                className="inline-flex items-center gap-2 text-sm text-amber-200 hover:text-amber-100 transition-colors"
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
