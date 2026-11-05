import { useCallback, useEffect, useRef, useState } from 'react';

type DetectedBarcode = { rawValue?: string };
type Detector = { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> };
type DetectorConstructor = new () => Detector;

export function CameraBarcodeScanner({ onDetected, disabled }: { onDetected: (barcode: string) => void; disabled: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const running = useRef(false);
  const opening = useRef(false);
  const generation = useRef(0);
  const disabledNow = useRef(disabled);
  const callback = useRef(onDetected);
  const [active, setActive] = useState(false);
  const [isOpening, setOpening] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { callback.current = onDetected; }, [onDetected]);
  useEffect(() => { disabledNow.current = disabled; }, [disabled]);
  const stop = useCallback(() => {
    generation.current++;
    running.current = false;
    opening.current = false;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach(track => track.stop());
    stream.current = null;
    if (video.current) video.current.srcObject = null;
    setActive(false);
    setOpening(false);
  }, []);
  useEffect(() => () => stop(), [stop]);
  useEffect(() => { if (disabled) stop(); }, [disabled, stop]);

  const start = async () => {
    if (opening.current || running.current || disabledNow.current) return;
    opening.current = true;
    const startedAt = ++generation.current;
    setOpening(true);
    const BrowserDetector = (globalThis as typeof globalThis & { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!navigator.mediaDevices?.getUserMedia || !BrowserDetector) {
      opening.current = false;
      setOpening(false);
      setMessage('Thiết bị này chưa hỗ trợ quét mã vạch bằng camera. Bạn vẫn có thể nhập mã hoặc dùng máy quét bàn phím.');
      return;
    }
    setMessage('');
    try {
      const acquired = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (startedAt !== generation.current || disabledNow.current) {
        acquired.getTracks().forEach(track => track.stop()); return;
      }
      stream.current = acquired;
      if (!video.current) { stop(); return; }
      video.current.srcObject = acquired;
      await video.current.play();
      if (startedAt !== generation.current || disabledNow.current) return;
      const detector = new BrowserDetector();
      opening.current = false; setOpening(false); running.current = true; setActive(true);
      const inspect = async () => {
        if (startedAt !== generation.current || !running.current || !video.current) return;
        try {
          const found = await detector.detect(video.current);
          if (startedAt !== generation.current || !running.current) return;
          const value = found.find(item => item.rawValue?.trim())?.rawValue?.trim();
          if (value) {
            if (value.length > 100) { setMessage('Mã quét dài hơn giới hạn 100 ký tự. Hãy kiểm tra bằng mắt và nhập lại.'); stop(); return; }
            callback.current(value);
            setMessage(`Đã đọc mã ${value}. Kiểm tra mã và bấm Ghi nhận scan để gửi.`);
            stop(); return;
          }
        } catch {
          if (startedAt !== generation.current) return;
          setMessage('Camera không đọc được mã. Bạn có thể thử lại hoặc nhập thủ công.'); stop(); return;
        }
        timer.current = window.setTimeout(() => { void inspect(); }, 400);
      };
      void inspect();
    } catch {
      if (startedAt !== generation.current) return;
      stop(); setMessage('Không mở được camera hoặc quyền truy cập đã bị từ chối. Bạn vẫn có thể nhập mã thủ công.');
    }
  };
  return <div className="my-3">
    <button type="button" className="button-secondary" disabled={disabled} onClick={() => {
      if (active || isOpening) { stop(); setMessage('Đã dừng quét bằng camera. Bạn có thể nhập mã thủ công.'); }
      else void start();
    }}>
      {isOpening ? 'Hủy mở camera' : active ? 'Tắt camera' : 'Quét bằng camera'}
    </button>
    {isOpening && <p role="status" className="text-sm mt-2">Đang chờ camera. Bạn có thể hủy và nhập mã thủ công.</p>}
    <video ref={video} muted playsInline aria-label="Hình camera để quét mã vạch" hidden={!active} className="mt-3 w-full max-w-md rounded-lg"/>
    {message && <p role="status" className="text-sm mt-2">{message}</p>}
  </div>;
}
