import { BrowserMultiFormatReader } from '@zxing/browser';
import { ChecksumException, FormatException, NotFoundException } from '@zxing/library';

/** Loaded only when the browser has no native barcode decoder. Frames stay on this device. */
export function createFallbackDetector() {
  const reader = new BrowserMultiFormatReader();
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Không tạo được vùng đọc mã vạch.');
  return {
    async detect(video: HTMLVideoElement): Promise<{ rawValue: string }[]> {
      if (!video.videoWidth || !video.videoHeight) return [];
      // Bound decoding work on high-resolution webcams without uploading frames.
      const scale = Math.min(1, 960 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      try {
        return [{ rawValue: reader.decodeFromCanvas(canvas).getText() }];
      } catch (error) {
        // An incomplete/blurred frame is normal while positioning a book.
        if (error instanceof NotFoundException || error instanceof ChecksumException || error instanceof FormatException) return [];
        throw error;
      }
    },
  };
}
