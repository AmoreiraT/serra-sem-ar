import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('3D Scene Error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center w-full h-full bg-gradient-to-b from-red-900 to-red-600 text-white">
          <div className="text-center space-y-6 p-8">
            <AlertTriangle className="w-16 h-16 mx-auto text-red-300" />
            <h2 className="text-2xl font-bold">Erro na Renderização 3D</h2>
            <p className="text-lg opacity-80 max-w-md">
              Ocorreu um problema ao carregar a visualização 3D. Isso pode ser devido a limitações do WebGL no seu navegador.
            </p>
            <div className="space-y-2">
              <Button
                onClick={this.handleRetry}
                className="bg-white text-red-900 hover:bg-gray-100"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Tentar Novamente
              </Button>
              <p className="text-sm opacity-60">
                Ou tente atualizar a página
              </p>
            </div>
            {this.state.error && (
              <details className="text-xs opacity-50 max-w-md">
                <summary className="cursor-pointer">Detalhes do erro</summary>
                <pre className="mt-2 text-left bg-black/30 p-2 rounded">
                  {this.state.error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

