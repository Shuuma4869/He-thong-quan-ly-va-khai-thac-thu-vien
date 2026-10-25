import { createHash } from 'node:crypto';
import { CirculationEvent, InvalidCirculationEvent, parseCirculationEvent } from './circulation-event';

export interface EventSource { topic: string; partition: number; offset: string; key: string | null; value: Buffer | null }
export interface DeadLetter {
  version: 1; source: { topic: string; partition: number; offset: string }; reason: string;
  payloadSha256: string; event: CirculationEvent | null;
}
export class NotificationProcessor {
  constructor(private readonly accept: (event: CirculationEvent) => Promise<unknown>,
    private readonly deadLetter: (record: DeadLetter) => Promise<void>,
    private readonly wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))) {}

  async process(source: EventSource, heartbeat: () => Promise<void>): Promise<void> {
    let event: CirculationEvent | null = null;
    let reason = 'STORAGE_UNAVAILABLE';
    try { event = parseCirculationEvent(source.topic, source.key, source.value); }
    catch (error) {
      if (!(error instanceof InvalidCirculationEvent)) throw error;
      reason = error.code;
    }
    if (event) {
      for (let attempt = 0; attempt < 5; attempt++) {
        await heartbeat();
        try { await this.accept(event); return; }
        catch (error) {
          if (error instanceof InvalidCirculationEvent) { reason = error.code; break; }
          if (attempt < 4) { await this.wait(250 * 2 ** attempt); await heartbeat(); }
        }
      }
    }
    // Envelope hỏng chỉ ghi dấu vết nguồn; không đưa raw payload có thể chứa secret/PII vào DLQ.
    await this.deadLetter({ version: 1, source: { topic: source.topic, partition: source.partition, offset: source.offset },
      reason, payloadSha256: createHash('sha256').update(source.value ?? Buffer.alloc(0)).digest('hex'), event });
  }
}
