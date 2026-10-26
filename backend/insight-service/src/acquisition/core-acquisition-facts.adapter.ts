import { BadGatewayException, ForbiddenException, Injectable, NotFoundException,
  ServiceUnavailableException, UnauthorizedException, UnprocessableEntityException } from '@nestjs/common';
import { demandFactsFromSource, type AcquisitionFactsPort, type AcquisitionScope,
  type AcquisitionSourceSnapshot } from './acquisition-source';

@Injectable()
export class CoreAcquisitionFactsAdapter implements AcquisitionFactsPort {
  async load(scope: AcquisitionScope, authorization: string): Promise<AcquisitionSourceSnapshot> {
    const base = process.env.CORE_API_URL || 'http://localhost:8080/api/v1';
    let url: URL;
    try { url = new URL(base); }
    catch { throw new ServiceUnavailableException('Core API chưa được cấu hình đúng.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
      || url.pathname !== '/api/v1')
      throw new ServiceUnavailableException('Core API chưa được cấu hình đúng.');
    const params = new URLSearchParams({ bookId: scope.bookId, branchId: scope.branchId,
      from: scope.from, to: scope.to });
    let response: Response;
    try {
      response = await fetch(`${base}/reports/acquisition-facts?${params}`, {
        headers: { Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(5000),
      });
    } catch { throw new ServiceUnavailableException('Core chưa trả được số liệu đề xuất.'); }
    if (response.status === 401) throw new UnauthorizedException('Phiên đăng nhập hết hạn.');
    if (response.status === 403) throw new ForbiddenException('Tài khoản không có quyền xem số liệu.');
    if (response.status === 404) throw new NotFoundException('Không tìm thấy sách hoặc chi nhánh.');
    if (response.status === 422) throw new UnprocessableEntityException('Khoảng thời gian hoặc phạm vi không hợp lệ.');
    if (!response.ok) throw new ServiceUnavailableException('Core chưa trả được số liệu đề xuất.');
    let raw: unknown;
    try { raw = await response.json(); }
    catch { throw new BadGatewayException('Core trả dữ liệu đề xuất không hợp lệ.'); }
    try {
      if (!raw || typeof raw !== 'object') throw new Error('snapshot');
      const snapshot = raw as AcquisitionSourceSnapshot;
      demandFactsFromSource(scope, snapshot);
      return snapshot;
    } catch { throw new BadGatewayException('Core trả dữ liệu đề xuất không hợp lệ.'); }
  }
}
