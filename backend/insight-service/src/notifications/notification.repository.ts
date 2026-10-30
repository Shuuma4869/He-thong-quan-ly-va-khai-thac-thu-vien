import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../discovery/metadata/history/prisma.service';
import { CirculationEvent, eventDigest, InvalidCirculationEvent } from './circulation-event';

const readerEvents = new Set(['HOLD_CREATED', 'HOLD_READY', 'HOLD_EXPIRED', 'COPY_BORROWED', 'COPY_RETURNED', 'LOAN_RENEWED']);
const reminderNamespace = Buffer.from('6ba7b8109dad11d180b400c04fd430c8', 'hex');

function reminderId(loanId: string, dueAt: Date) {
  const bytes = createHash('sha1').update(reminderNamespace).update(`${loanId}:${dueAt.toISOString()}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
            readerId: event.readerId, branchId: event.branchId, occurredAt: new Date(event.occurredAt), receivedAt: new Date(),
            dueAt: event.dueAt ? new Date(event.dueAt) : null, expiresAt: event.expiresAt ? new Date(event.expiresAt) : null };
          await tx.circulationNotice.upsert({ where, create: data, update: data });
          if (event.aggregateType === 'HOLD') await this.updateStaffWorkItems(tx, event);
          if (readerEvents.has(event.eventType)) {
            await tx.readerNotification.create({ data: { id: event.eventId, readerId: event.readerId,
              aggregateType: event.aggregateType, aggregateId: event.aggregateId, aggregateVersion: version,
              eventType: event.eventType, occurredAt: new Date(event.occurredAt),
              expiresAt: event.expiresAt ? new Date(event.expiresAt) : null } });
          }
          return 'APPLIED';
        }, { maxWait: 3000, timeout: 5000 });
      } catch (error) {
        // Hai aggregate dùng trùng eventId: transaction sau đọc receipt đã commit để đối chiếu digest.
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && attempt < 2) continue;
        throw error;
      }
    }
  }

  async list(readerId: string, page: number, size: number) {
    const [items, totalElements] = await this.db.$transaction([
      this.db.readerNotification.findMany({ where: { readerId }, orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
        skip: page * size, take: size }),
      this.db.readerNotification.count({ where: { readerId } }),
    ]);
    return { items: items.map(item => ({ id: item.id, aggregateType: item.aggregateType, aggregateId: item.aggregateId,
      eventType: item.eventType, occurredAt: item.occurredAt, receivedAt: item.receivedAt, expiresAt: item.expiresAt,
      readAt: item.readAt })), page, size, totalElements };
  }

  async unreadCount(readerId: string) {
    return { count: await this.db.readerNotification.count({ where: { readerId, readAt: null } }) };
  }

  async markRead(readerId: string, id: string) {
    const result = await this.db.readerNotification.updateMany({ where: { id, readerId, readAt: null },
      data: { readAt: new Date() } });
    if (result.count === 0) {
      const found = await this.db.readerNotification.findFirst({ where: { id, readerId }, select: { id: true } });
      return found ? 'ALREADY_READ' as const : 'NOT_FOUND' as const;
    }
    return 'UPDATED' as const;
  }

  private async updateStaffWorkItems(tx: Prisma.TransactionClient, event: CirculationEvent) {
    const now = new Date(event.occurredAt);
    const identity = { aggregateType: event.aggregateType, aggregateId: event.aggregateId };
    const waiting = { ...identity, workType: 'WAITING' };
    const ready = { ...identity, workType: 'READY' };
    const resolve = { resolvedAt: now, updatedAt: now };
    if (event.eventType === 'HOLD_CREATED') {
      await tx.staffWorkItem.upsert({ where: { aggregateType_aggregateId_workType: waiting },
        create: { ...waiting, branchId: event.branchId, createdAt: now, updatedAt: now, resolvedAt: null },
        update: { branchId: event.branchId, ...resolve } });
    } else if (event.eventType === 'HOLD_READY') {
      await tx.staffWorkItem.updateMany({ where: { ...waiting, resolvedAt: null }, data: resolve });
      await tx.staffWorkItem.upsert({ where: { aggregateType_aggregateId_workType: ready },
        create: { ...ready, branchId: event.branchId, createdAt: now, updatedAt: now, resolvedAt: null },
        update: { branchId: event.branchId, ...resolve } });
    } else if (['HOLD_EXPIRED', 'HOLD_CANCELLED', 'HOLD_FULFILLED'].includes(event.eventType)) {
      await tx.staffWorkItem.updateMany({ where: { ...identity, resolvedAt: null }, data: resolve });
    }
  }

  async listStaffWorkItems(input: { branchId?: string; workType?: 'WAITING' | 'READY'; page: number; size: number }) {
    const where = { resolvedAt: null, ...(input.branchId ? { branchId: input.branchId } : {}),
      ...(input.workType ? { workType: input.workType } : {}) };
    const [items, totalElements] = await this.db.$transaction([
      this.db.staffWorkItem.findMany({ where, orderBy: [{ createdAt: 'asc' }, { aggregateId: 'asc' }],
        skip: input.page * input.size, take: input.size,
        select: { aggregateType: true, aggregateId: true, workType: true, branchId: true, createdAt: true, updatedAt: true } }),
      this.db.staffWorkItem.count({ where }),
    ]);
    return { items, page: input.page, size: input.size, totalElements };
  }

  async staffWorkUnreadCount(branchId?: string) {
    return { count: await this.db.staffWorkItem.count({ where: { resolvedAt: null, ...(branchId ? { branchId } : {}) } }) };
  }

  async createDueReminders(now = new Date()) {
    const dueWithinDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const loans = await this.db.circulationNotice.findMany({ where: { aggregateType: 'LOAN',
      eventType: { in: ['COPY_BORROWED', 'LOAN_RENEWED'] }, dueAt: { gt: now, lte: dueWithinDay } },
      select: { aggregateId: true, aggregateVersion: true, readerId: true, dueAt: true } });
    const reminders = loans.flatMap(loan => loan.dueAt ? [{
      id: reminderId(loan.aggregateId, loan.dueAt), readerId: loan.readerId, aggregateType: 'LOAN',
      aggregateId: loan.aggregateId, aggregateVersion: loan.aggregateVersion, eventType: 'LOAN_DUE_REMINDER',
      occurredAt: now, expiresAt: null,
    }] : []);
    if (!reminders.length) return 0;
    return (await this.db.readerNotification.createMany({ data: reminders, skipDuplicates: true })).count;
  }
}
