import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { HistoryQuery } from './history.dto';

const projection = { id: true, isbn13: true, attempts: true, createdAt: true } as const;

@Injectable()
export class HistoryRepository {
  constructor(private readonly db: PrismaService) {}

  create(ownerId: string, isbn13: string, attempts: { provider: string; status: string }[]) {
    return this.db.metadataLookup.create({ data: { ownerId, isbn13, attempts }, select: projection });
  }

  async list(ownerId: string, query: HistoryQuery) {
    const where = { ownerId, ...(query.isbn ? { isbn13: { startsWith: query.isbn } } : {}) };
    const [items, totalElements] = await this.db.$transaction([
      this.db.metadataLookup.findMany({ where, select: projection,
        orderBy: [{ createdAt: query.sort === 'oldest' ? 'asc' : 'desc' }, { id: 'asc' }],
        skip: query.page * query.size, take: query.size }),
      this.db.metadataLookup.count({ where }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items, page: { number: query.page, size: query.size, totalElements,
      totalPages: Math.ceil(totalElements / query.size) } };
  }

  find(ownerId: string, id: string) {
    return this.db.metadataLookup.findFirst({ where: { id, ownerId }, select: projection });
  }

  delete(ownerId: string, id: string) {
    return this.db.metadataLookup.deleteMany({ where: { id, ownerId } });
  }
}
