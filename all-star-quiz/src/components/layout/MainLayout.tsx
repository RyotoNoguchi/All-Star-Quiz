import { type ReactNode, type FC } from 'react';

type Props = {
  children: ReactNode;
  className?: string;
};

export const MainLayout: FC<Props> = (props) => {
  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 ${props.className || ''}`}
    >
      <div className="container mx-auto px-4 py-8">{props.children}</div>
    </div>
  );
};
