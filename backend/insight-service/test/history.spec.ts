import { HistoryService } from '../src/discovery/metadata/history/history.service';
import { HistoryRepository } from '../src/discovery/metadata/history/history.repository';
import { MetadataService } from '../src/discovery/metadata/metadata.service';
import { HistoryQuery, LookupRequest } from '../src/discovery/metadata/history/history.dto';
import { ValidationPipe } from '@nestjs/common';

const owner = '23f78353-0107-44b1-93d3-9c28ebd2a134';
const repository = { create: jest.fn(), list: jest.fn(), find: jest.fn(), delete: jest.fn() };
const metadata = { book: jest.fn() };
const service = new HistoryService(repository as unknown as HistoryRepository, metadata as unknown as MetadataService);
beforeEach(() => jest.resetAllMocks());

test('chỉ lưu dấu vết provider, không lưu nội dung hoặc token', async () => {
  const lookup = { attempts: [{ provider: 'open-library', status: 'ok' }], candidates: [{ title: 'Không lưu snapshot' }] };
  metadata.book.mockResolvedValue(lookup);
  repository.create.mockResolvedValue({ id: 'record' });
  expect(await service.lookup(owner, '9780132350884')).toEqual({ record: { id: 'record' }, lookup });
  expect(repository.create).toHaveBeenCalledWith(owner, '9780132350884', lookup.attempts);
});
test('provider validation thất bại không ghi database', async () => {
  metadata.book.mockRejectedValue(new Error('invalid ISBN'));
  await expect(service.lookup(owner, '9780132350880')).rejects.toThrow();
  expect(repository.create).not.toHaveBeenCalled();
});
test('ghi thất bại không báo đã lưu, không lộ lỗi database', async () => {
  metadata.book.mockResolvedValue({ attempts: [], candidates: [] });
  repository.create.mockRejectedValue(new Error('postgres credentials'));
  await expect(service.lookup(owner, '9780132350884')).rejects.toMatchObject({ status: 503 });
});
test('bản ghi không thuộc principal trả 404, không gọi provider', async () => {
  repository.find.mockResolvedValue(null);
  await expect(service.replay(owner, 'id')).rejects.toMatchObject({ status: 404 });
  expect(repository.find).toHaveBeenCalledWith(owner, 'id');
  expect(metadata.book).not.toHaveBeenCalled();
});
test('mở lại tra provider hiện tại, không ghi Catalog hay tạo lịch sử mới', async () => {
  repository.find.mockResolvedValue({ isbn13: '9780132350884' });
  metadata.book.mockResolvedValue({ candidates: [] });
  await service.replay(owner, 'id');
  expect(metadata.book).toHaveBeenCalledWith('9780132350884');
  expect(repository.create).not.toHaveBeenCalled();
});
test('xóa dùng owner và không tìm thấy trả 404', async () => {
  repository.delete.mockResolvedValue({ count: 0 });
  await expect(service.remove(owner, 'id')).rejects.toMatchObject({ status: 404 });
  expect(repository.delete).toHaveBeenCalledWith(owner, 'id');
});
test('list chuyển nguyên scope đã xác thực xuống repository', async () => {
  repository.list.mockResolvedValue({ items: [] });
  const query = new HistoryQuery();
  await service.list(owner, query);
  expect(repository.list).toHaveBeenCalledWith(owner, query);
});
const validation = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
test.each([{ page: '-1' }, { size: '101' }, { isbn: '% SQL' }, { sort: 'ownerId' }, { ownerId: owner }])('query sai bị chặn: %j', async value => {
  await expect(validation.transform(value, { type: 'query', metatype: HistoryQuery })).rejects.toMatchObject({ status: 400 });
});
test('DTO chuyển page/size thành số', async () => {
  expect(await validation.transform({ page: '2', size: '5' }, { type: 'query', metatype: HistoryQuery }))
    .toMatchObject({ page: 2, size: 5, sort: 'newest' });
});
test('không nhận owner từ body', async () => {
  await expect(validation.transform({ isbn13: '9780132350884', ownerId: owner }, { type: 'body', metatype: LookupRequest }))
    .rejects.toMatchObject({ status: 400 });
});
