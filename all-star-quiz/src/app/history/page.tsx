import type { FC } from 'react';
import { GameLayout } from '@/components/layout/GameLayout';
import { HistoryScreen } from '@/components/history/HistoryScreen';
const HistoryPage: FC = () => (
  <GameLayout title="自分の成績・履歴">
    <HistoryScreen />
  </GameLayout>
);
export default HistoryPage;
