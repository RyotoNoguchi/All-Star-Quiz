import { type ReactNode, type FC } from 'react';
import { Card } from '@/components/ui/card';

type Props = {
  children: ReactNode;
  title?: string;
  showHeader?: boolean;
}

export const GameLayout: FC<Props> = (props) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
      {props.showHeader !== false && (
        <header className="bg-black/20 backdrop-blur-sm border-b border-white/10">
          <div className="container mx-auto px-4 py-4">
            <h1 className="text-2xl font-bold text-center text-white drop-shadow-lg">
              {props.title || 'All Star Quiz'}
            </h1>
          </div>
        </header>
      )}
      
      <main className="container mx-auto px-4 py-8">
        <Card className="bg-white/10 backdrop-blur-md border-white/20 shadow-2xl text-white">
          <div className="p-6">
            {props.children}
          </div>
        </Card>
      </main>
    </div>
  );
}