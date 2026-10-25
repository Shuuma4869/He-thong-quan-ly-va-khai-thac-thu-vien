import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../discovery/metadata/history/prisma.service';
import { CirculationEvent, eventDigest, InvalidCirculationEvent } from './circulation-event';

@Injectable()
export class NotificationRepository {
  constructor(private readonly db: PrismaService) {}
  async accept(event: CirculationEvent): Promise<'APPLIED' | 'DUPLICATE' | 'OLDER'> {
    const digest = eventDigest(event);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.db.$transaction(async tx => {
          await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '3s'");
          await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '4s'");
          // Khóa trong DB Insight, không truy cập dữ liệu giao dịch Core.
          const key = `${event.aggregateType}:${event.aggregateId}`;
          await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
          const consumed = await tx.consumedCirculationEvent.findUnique({ where: { eventId: event.eventId } });
          if (consumed) {
            if (consumed.digest !== digest) throw new InvalidCirculationEvent('EVENT_ID_REUSED');
            return 'DUPLICATE';
          }
          const identity = { aggregateType: event.aggregateType, aggregateId: event.aggregateId };
          const where = { aggregateType_aggregateId: identity };
          const current = await tx.circulationNotice.findUnique({ where });
          if (current && current.readerId !== event.readerId) throw new InvalidCirculationEvent('READER_CHANGED');
          const version = BigInt(event.aggregateVersion);
          if (current && current.aggregateVersion === version) throw new InvalidCirculationEvent('VERSION_REUSED');
          await tx.consumedCirculationEvent.create({ data: { eventId: event.eventId, digest } });
          if (current && current.aggregateVersion > version) return 'OLDER';
          const data = { ...identity, aggregateVersion: version, eventId: event.eventId, eventType: event.eventType,
            readerId: event.readerId, occurredAt: new Date(event.occurredAt), receivedAt: new Date(),
            dueAt: event.dueAt ? new Date(event.dueAt) : null, expiresAt: event.expiresAt ? new Date(event.expiresAt) : null };
          await tx.circulationNotice.upsert({ where, create: data, update: data });
          return 'APPLIED';
        }, { maxWait: 3000, timeout: 5000 });
      } catch (error) {
        // Hai aggregate dùng trùng eventId: transaction sau đọc receipt đã commit để đối chiếu digest.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2) continue;
        throw error;
      }
    }
  }
}
