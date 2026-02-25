import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { LogIn, LogOut, Pin } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent } from 'react';
import { cn } from '@/lib/utils';
import { useAuth } from '../providers/AuthProvider';
import { db } from '../services/firebaseConfig';
import { useCovidStore } from '../stores/covidStore';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';

const MAX_MESSAGE_LENGTH = 240;
const MAX_NAME_LENGTH = 64;

interface MemorialPanelProps {
  layout?: 'floating' | 'sheet';
  className?: string;
}

export const MemorialPanel = ({ layout = 'floating', className }: MemorialPanelProps = {}) => {
  const { user, isLoading, signInWithGoogle, signOutUser } = useAuth();
  const data = useCovidStore((state) => state.data);
  const currentDateIndex = useCovidStore((state) => state.currentDateIndex);
  const isSheet = layout === 'sheet';
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setError(null);
  }, [user]);

  const currentDate = data[currentDateIndex]?.date;
  const isoDate = useMemo(() => {
    if (!currentDate) return '';
    return currentDate.toISOString().slice(0, 10);
  }, [currentDate]);
  const readableDate = useMemo(() => {
    if (!currentDate) return '';
    return currentDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  }, [currentDate]);

  const handleSubmit = async () => {
    if (!user || !isoDate || !message.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'memorials'), {
        date: isoDate,
        dateIndex: currentDateIndex,
        name: name.trim() || null,
        message: message.trim(),
        uid: user.uid,
        userName: user.displayName ?? null,
        userPhoto: user.photoURL ?? null,
        createdAt: serverTimestamp(),
      });
      setName('');
      setMessage('');
    } catch (submitError: any) {
      setError('Nao foi possivel salvar o memorial. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignIn = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (signInError) {
      setError('Nao foi possivel entrar com o Google. Tente novamente.');
    }
  };

  return (
    <div
      className={cn(
        'pointer-events-auto space-y-3 overflow-auto rounded-2xl border border-white/20 bg-black/85 p-4 text-white shadow-2xl backdrop-blur-md',
        isSheet
          ? 'w-full max-h-[70vh]'
          : 'desktop-memorial-card absolute bottom-6 right-6 z-10 w-[min(32vw,390px)] max-h-[82vh] safe-bottom',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-amber-200">
            <Pin className="h-4 w-4" />
            <p className="text-[11px] uppercase tracking-[0.32em]">Memorial</p>
          </div>
          <p className="mt-1 text-[12px] text-white/70">
            {readableDate ? `Data selecionada: ${readableDate}` : 'Carregando data...'}
          </p>
          {user && (
            <p className="text-[11px] text-white/60">
              Conectado como {user.displayName ?? 'Usuario'}
            </p>
          )}
        </div>
        {user && (
          <Button
            variant="outline"
            size="sm"
            onClick={signOutUser}
            className="border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!user && (
        <div className="space-y-3 text-[12px] text-white/80">
          <p>
            Entre com Google para registrar uma lembranca no dia exato da linha do tempo.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignIn}
            disabled={isLoading}
            className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            <LogIn className="h-4 w-4" />
            Entrar com Google
          </Button>
          {error && <p className="text-[11px] text-red-300">{error}</p>}
        </div>
      )}

      {user && (
        <div className="space-y-3">
          <div className="text-[12px] text-white/70">
            Use a linha do tempo para escolher o dia e deixe uma mensagem em memoria.
          </div>
          <Input
            type="text"
            value={name}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value.slice(0, MAX_NAME_LENGTH))}
            placeholder="Nome (opcional)"
            className="border-white/15 bg-white/5 text-sm text-white placeholder:text-white/40"
          />
          <Textarea
            value={message}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => setMessage(event.target.value.slice(0, MAX_MESSAGE_LENGTH))}
            placeholder="Mensagem memorial..."
            className="min-h-24 border-white/15 bg-white/5 text-sm text-white placeholder:text-white/40"
          />
          <div className="flex items-center justify-between text-[11px] text-white/60">
            <span>{message.length}/{MAX_MESSAGE_LENGTH}</span>
            {error && <span className="text-red-300">{error}</span>}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!message.trim() || !isoDate || isSubmitting}
            className="w-full bg-amber-500 text-black hover:bg-amber-400"
          >
            {isSubmitting ? 'Salvando...' : 'Fixar memorial na estrada'}
          </Button>
        </div>
      )}
    </div>
  );
};

export default MemorialPanel;
