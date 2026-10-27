import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isUUID } from 'class-validator';
import { PrismaService } from '../discovery/metadata/history/prisma.service';
import { scoreDemand } from './acquisition-score';
import { demandFactsFromSource, type AcquisitionScope, type AcquisitionSourceSnapshot } from './acquisition-source';

type Decision = 'APPROVED' | 'REJECTED';

function actor(value: string): void {
  if (!isUUID(value)) throw new BadRequestException('Định danh nhân viên không hợp lệ.');
}

/** Lưu bằng chứng từ snapshot Core và quyết định của nhân viên. */
@Injectable()
export class RecommendationWorkflow {
  constructor(private readonly db: PrismaService) {}

  async createDraft(actorId: string, scope: AcquisitionScope, snapshot: AcquisitionSourceSnapshot) {
    actor(actorId);
    const facts = demandFactsFromSource(scope, snapshot);
    const result = scoreDemand(facts);
    if (snapshot.sourceRevision.length > 255 || snapshot.sourceRevision !== snapshot.sourceRevision.trim())
      throw new BadRequestException('Phiên bản nguồn không hợp lệ.');
    const evidence = {
      copiesOwned: facts.copiesOwned,
      copiesAvailable: facts.copiesAvailable,
      waitingHolds: snapshot.waitingHolds,
      loansStarted: snapshot.loansStarted,
      favoritesAdded: snapshot.favoritesAdded,
      components: {
        waitingHolds: { ...result.components.waitingHolds },
        loansStarted: { ...result.components.loansStarted },
        favoritesAdded: { ...result.components.favoritesAdded },
      },
      omittedSignals: [...result.omittedSignals],
      manualReviewRequired: true,
      purchaseDecisionAllowed: false,
    };
    try {
      return await this.db.acquisitionRecommendation.create({ data: {
        bookId: facts.bookId,
        branchId: facts.branchId,
        windowFrom: new Date(facts.window.from),
        windowTo: new Date(facts.window.to),
        snapshotAt: new Date(facts.window.asOf),
        sourceContractVersion: snapshot.contractVersion,
        sourceRevision: snapshot.sourceRevision,
        scoreVersion: result.version,
        score: result.score,
        confidence: result.confidence,
        evidence,
        createdBy: actorId,
      } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException('Đề xuất của snapshot này đã tồn tại.');
      throw error;
    }
  }

  async decide(id: string, actorId: string, action: Decision, reason: string, expectedVersion: number) {
    if (!isUUID(id)) throw new BadRequestException('Định danh đề xuất không hợp lệ.');
    actor(actorId);
    if (action !== 'APPROVED' && action !== 'REJECTED') throw new BadRequestException('Quyết định không hợp lệ.');
    const note = reason?.trim();
    if (!note || note.length < 10 || note.length > 1000)
      throw new BadRequestException('Lý do cần từ 10 đến 1000 ký tự.');
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
      throw new BadRequestException('Version không hợp lệ.');

    return this.db.$transaction(async tx => {
      const current = await tx.acquisitionRecommendation.findUnique({ where: { id }, select: { state: true, version: true } });
      if (!current) throw new NotFoundException('Không tìm thấy đề xuất.');
      if (current.state !== 'DRAFT' || current.version !== expectedVersion)
        throw new ConflictException('Đề xuất đã được xử lý hoặc đã thay đổi.');
      const changed = await tx.acquisitionRecommendation.updateMany({
        where: { id, state: 'DRAFT', version: expectedVersion },
        data: { state: action, version: { increment: 1 }, reviewedBy: actorId,
          reviewedAt: new Date(), reviewReason: note },
      });
      if (changed.count !== 1) throw new ConflictException('Đề xuất đã được xử lý hoặc đã thay đổi.');
      await tx.acquisitionDecision.create({ data: {
        recommendationId: id, action, actorId, reason: note, version: expectedVersion + 1,
      } });
      return tx.acquisitionRecommendation.findUniqueOrThrow({
        where: { id }, include: { decisions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
      });
    });
  }

  async get(id: string) {
    if (!isUUID(id)) throw new BadRequestException('Định danh đề xuất không hợp lệ.');
    const record = await this.db.acquisitionRecommendation.findUnique({
      where: { id }, include: { decisions: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!record) throw new NotFoundException('Không tìm thấy đề xuất.');
    return record;
  }

  async list(page = 0, size = 20, state?: 'DRAFT' | Decision) {
    if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(size) || size < 1 || size > 50)
      throw new BadRequestException('Trang hoặc số dòng không hợp lệ.');
    if (state && !['DRAFT', 'APPROVED', 'REJECTED'].includes(state))
      throw new BadRequestException('Trạng thái không hợp lệ.');
    const where = state ? { state } : {};
    const [totalElements, items] = await this.db.$transaction([
      this.db.acquisitionRecommendation.count({ where }),
      this.db.acquisitionRecommendation.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page * size, take: size }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    return { items, page: { number: page, size, totalElements,
      totalPages: totalElements === 0 ? 0 : Math.ceil(totalElements / size) } };
  }

  async exportCsv(state?: 'DRAFT' | Decision): Promise<string> {
    if (state && !['DRAFT', 'APPROVED', 'REJECTED'].includes(state))
      throw new BadRequestException('Trạng thái không hợp lệ.');
    const where = state ? { state } : {};
    const [total, rows] = await this.db.$transaction([
      this.db.acquisitionRecommendation.count({ where }),
      this.db.acquisitionRecommendation.findMany({ where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1001,
        select: { id: true, bookId: true, branchId: true, windowFrom: true, windowTo: true,
          snapshotAt: true, score: true, confidence: true, state: true, createdAt: true,
          reviewReason: true } }),
    ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    if (total > 1000 || rows.length > 1000)
      throw new BadRequestException('Báo cáo vượt 1000 dòng; hãy lọc theo trạng thái.');
    const csv = (value: unknown): string => {
      let text = value == null ? '' : String(value);
      if (/^[\s\x00-\x1f]*[=+\-@]/u.test(text)) text = `'${text}`;
      return `"${text.replaceAll('"', '""')}"`;
    };
    const header = ['id', 'bookId', 'branchId', 'windowFrom', 'windowTo', 'snapshotAt',
      'score', 'confidence', 'state', 'createdAt', 'reviewReason'];
    return '\uFEFF' + [header.join(','), ...rows.map(row => header.map(key => {
      const value = row[key as keyof typeof row];
      return csv(value instanceof Date ? value.toISOString() : value);
    }).join(','))].join('\r\n') + '\r\n';
  }
}
