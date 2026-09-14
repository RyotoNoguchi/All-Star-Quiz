'use client';
import { useState, type FC } from 'react';
import Image from 'next/image';
type Props = { url: string; alt: string };
export const ChoiceImage: FC<Props> = ({ url, alt }) => {
  const [failed, setFailed] = useState(false);
  return failed ? (
    <span
      role="img"
      aria-label={alt}
      className="block rounded bg-black/20 p-3 text-sm mb-2"
    >
      {alt}（画像を読み込めませんでした）
    </span>
  ) : (
    <Image
      src={url}
      alt={alt}
      width={480}
      height={240}
      unoptimized
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full max-h-48 object-contain mb-2 rounded"
    />
  );
};
