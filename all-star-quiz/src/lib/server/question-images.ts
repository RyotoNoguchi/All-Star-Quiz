import sharp from 'sharp';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const normalizeQuestionImage = async (data: Buffer) => {
  if (!data.length || data.length > MAX_IMAGE_BYTES)
    throw new Error('画像は2MB以下にしてください。');
  const image = sharp(data, {
    limitInputPixels: 4096 * 4096,
    failOn: 'warning',
  });
  const metadata = await image.metadata();
  if (
    !['png', 'jpeg', 'webp'].includes(metadata.format || '') ||
    (metadata.pages || 1) > 1
  )
    throw new Error('静止画のPNG・JPEG・WebPを選んでください。');
  if (
    !metadata.width ||
    !metadata.height ||
    metadata.width > 4096 ||
    metadata.height > 4096
  )
    throw new Error('画像の縦横は4096ピクセル以下にしてください。');
  return image.rotate().webp({ quality: 85 }).toBuffer();
};
