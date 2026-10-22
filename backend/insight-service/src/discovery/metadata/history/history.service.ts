import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { MetadataService } from '../metadata.service';
import { HistoryRepository } from './history.repository';
import { HistoryQuery } from './history.dto';

@Injectable()
export class HistoryService {
  constructor(private readonly repository: HistoryRepository, private readonly metadata: MetadataService) {}

  private async database<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch { throw new ServiceUnavailableException('Không truy cập được lịch sử tra cứu. Vui lòng thử lại.'); }
  }

  async lookup(ownerId: string, isbn13: string) {
    // Không giữ transaction trong lúc chờ provider và không lưu payload bên thứ ba.
    const lookup = await this.metadata.book(isbn13);
    const attempts = lookup.attempts.map(({ provider, status }) => ({ provider, status }));
    const record = await this.database(() => this.repository.create(ownerId, isbn13, attempts));
    return { record, lookup };
  }

  list(ownerId: string, query: HistoryQuery) {
    return this.database(() => this.repository.list(ownerId, query));
  }

  async get(ownerId: string, id: string) {
    const record = await this.database(() => this.repository.find(ownerId, id));
    if (!record) throw new NotFoundException('Không tìm thấy lịch sử tra cứu.');
    return record;
  }

  async replay(ownerId: string, id: string) {
    const record = await this.get(ownerId, id);
    // Tra lại nguồn hiện tại, không coi dữ liệu cũ là metadata đã xác minh.
    return this.metadata.book(record.isbn13);
  }

  async remove(ownerId: string, id: string) {
    const result = await this.database(() => this.repository.delete(ownerId, id));
    if (result.count === 0) throw new NotFoundException('Không tìm thấy lịch sử tra cứu.');
  }
}
