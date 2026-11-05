import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CameraBarcodeScanner } from './CameraBarcodeScanner';

const mediaDescriptor = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllGlobals();
  if (mediaDescriptor) Object.defineProperty(navigator, 'mediaDevices', mediaDescriptor);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

it('bỏ kết quả mở camera đến muộn sau khi thao tác quét bị khóa rồi mở lại', async () => {
  let grant!: (stream: MediaStream) => void;
  const stop = vi.fn();
  const onDetected = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn(() => new Promise<MediaStream>(resolve => { grant = resolve; })),
  } });
  vi.stubGlobal('BarcodeDetector', class { detect = vi.fn().mockResolvedValue([{ rawValue: 'OLD-SCAN' }]); });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const view = render(<CameraBarcodeScanner onDetected={onDetected} disabled={false}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Quét bằng camera' }));
  view.rerender(<CameraBarcodeScanner onDetected={onDetected} disabled/>);
  view.rerender(<CameraBarcodeScanner onDetected={onDetected} disabled={false}/>);
  await act(async () => { grant({ getTracks: () => [{ stop }] } as unknown as MediaStream); });
  expect(stop).toHaveBeenCalledOnce();
  expect(play).not.toHaveBeenCalled();
  expect(onDetected).not.toHaveBeenCalled();
});

it('hủy lúc chờ quyền camera không ảnh hưởng lượt mở tiếp theo', async () => {
  const grants: Array<(stream: MediaStream) => void> = [];
  const oldStop = vi.fn(), currentStop = vi.fn(), onDetected = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn(() => new Promise<MediaStream>(resolve => { grants.push(resolve); })),
  } });
  vi.stubGlobal('BarcodeDetector', class { detect = vi.fn().mockResolvedValue([{ rawValue: 'CURRENT-SCAN' }]); });
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  render(<CameraBarcodeScanner onDetected={onDetected} disabled={false}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Quét bằng camera' }));
  expect(screen.getByRole('status')).toHaveTextContent('Đang chờ camera');
  fireEvent.click(screen.getByRole('button', { name: 'Hủy mở camera' }));
  fireEvent.click(screen.getByRole('button', { name: 'Quét bằng camera' }));
  await act(async () => { grants[0]({ getTracks: () => [{ stop: oldStop }] } as unknown as MediaStream); });
  expect(oldStop).toHaveBeenCalledOnce();
  expect(play).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Hủy mở camera' })).toBeEnabled();
  await act(async () => { grants[1]({ getTracks: () => [{ stop: currentStop }] } as unknown as MediaStream); });
  expect(onDetected).toHaveBeenCalledExactlyOnceWith('CURRENT-SCAN');
  expect(currentStop).toHaveBeenCalledOnce();
});

it('bỏ kết quả nhận dạng cũ sau khi tắt rồi mở camera mới', async () => {
  const detections: Array<(values: { rawValue: string }[]) => void> = [];
  const stop = vi.fn(), onDetected = vi.fn();
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }),
  } });
  vi.stubGlobal('BarcodeDetector', class {
    detect = vi.fn(() => new Promise<{ rawValue: string }[]>(resolve => { detections.push(resolve); }));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const view = render(<CameraBarcodeScanner onDetected={onDetected} disabled={false}/>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Quét bằng camera' })); });
  fireEvent.click(screen.getByRole('button', { name: 'Tắt camera' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Quét bằng camera' })); });
  await act(async () => { detections[0]([{ rawValue: 'OLD-SCAN' }]); });
  expect(onDetected).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Tắt camera' })).toBeEnabled();
  await act(async () => { detections[1]([{ rawValue: 'CURRENT-SCAN' }]); });
  expect(onDetected).toHaveBeenCalledExactlyOnceWith('CURRENT-SCAN');
  view.unmount();
});
