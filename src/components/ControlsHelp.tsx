import { HelpCircle, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from './ui/button';

export const ControlsHelp = () => {
  const [isOpen, setIsOpen] = useState(false);

  const movement = [
    { key: 'W / D', action: 'Seguir pela linha do tempo' },
    { key: 'S / A', action: 'Retornar no tempo' },
    { key: 'Shift', action: 'Correr' },
  ];
  const temporal = [
    { key: ', / < / [', action: 'Dia anterior' },
    { key: '. / > / ]', action: 'Próximo dia' },
  ];

  return (
    <>
      {/* Help Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="absolute top-4 right-4 bg-black/70 border-white/30 text-white hover:bg-white/10 z-10"
      >
        <HelpCircle className="w-4 h-4 mr-2" />
        Controles
      </Button>

      {/* Help Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-black/90 text-white p-6 rounded-lg max-w-md w-full mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold">Controles de Navegação</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="font-semibold mb-2 text-blue-400">Movimento (1ª pessoa)</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {movement.map((control, index) => (
                    <div key={index} className="flex justify-between">
                      <span className="font-mono bg-white/10 px-2 py-1 rounded text-xs">
                        {control.key}
                      </span>
                      <span className="opacity-80">{control.action}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-2 text-green-400">Navegação Temporal</h4>
                <div className="grid grid-cols-1 gap-2 text-sm">
                  {temporal.map((control, index) => (
                    <div key={index} className="flex justify-between">
                      <span className="font-mono bg-white/10 px-2 py-1 rounded text-xs">
                        {control.key}
                      </span>
                      <span className="opacity-80">{control.action}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-white/20 pt-3 mt-4">
                <h4 className="font-semibold mb-2 text-orange-400">Mouse</h4>
                <div className="text-sm space-y-1">
                  <p>• <strong>Clique na cena:</strong> Capturar cursor (Pointer Lock)</p>
                  <p>• <strong>ESC:</strong> Liberar cursor</p>
                  <p>• <strong>Mouse:</strong> Olhar ao redor</p>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center">
              <Button
                onClick={() => setIsOpen(false)}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                Entendi
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
