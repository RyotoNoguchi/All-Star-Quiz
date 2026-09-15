'use client';
import type { FC } from 'react';
import type { GameSnapshot } from '@/types/game';
import type { ResultPresentation } from '@/lib/result-presentation';
import type { ServerClock } from '@/lib/server-clock';
import { useGameAudio } from '@/hooks/use-game-audio';
import { Button } from '@/components/ui/button';
type Props = {
  code: string;
  state: GameSnapshot | null;
  presentation: ResultPresentation | null;
  clock: ServerClock | null;
  connected: boolean;
};
export const AudioControls: FC<Props> = (props) => {
  const audio = useGameAudio(props);
  return (
    <section
      className="space-y-3 rounded border border-white/30 p-4"
      aria-label="音声設定"
    >
      <h2 className="text-xl font-bold">音声設定</h2>
      <p role="status">{audio.message}</p>
      <Button
        disabled={!props.connected}
        onClick={() => (audio.enabled ? audio.disable() : void audio.enable())}
      >
        {audio.enabled ? '音声を停止' : '音声を有効にする'}
      </Button>
      <label className="block">
        音量 {Math.round(audio.volume * 100)}%
        <input
          aria-label="音量"
          type="range"
          min={0}
          max={100}
          value={audio.volume * 100}
          onChange={(event) =>
            audio.setVolume(Number(event.target.value) / 100)
          }
          className="block w-full max-w-sm"
        />
      </label>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={audio.muted}
          onChange={(event) => audio.setMuted(event.target.checked)}
        />
        ミュート
      </label>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={audio.bgm}
          onChange={(event) => audio.setBgm(event.target.checked)}
        />
        BGMを再生
      </label>
    </section>
  );
};
