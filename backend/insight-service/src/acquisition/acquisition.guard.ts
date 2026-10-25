import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable,
  ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request, Response as ExpressResponse } from 'express';

export const acquisitionActor = Symbol('acquisitionActor');

@Injectable()
export class AcquisitionGuard implements CanActivate {
  private readonly windows = new Map<string, { start: number; count: number }>();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authorization = request.headers.authorization;
    if (!authorization || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) || authorization.length > 8192)
      throw new UnauthorizedException('Cần đăng nhập.');
    const base = process.env.CORE_API_URL || 'http://localhost:8080/api/v1';
    let url: URL;
    try { url = new URL(base); }
    catch { throw new ServiceUnavailableException('Core API chưa được cấu hình đúng.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
        || url.pathname !== '/api/v1')
      throw new ServiceUnavailableException('Core API chưa được cấu hình đúng.');

    let response: Response;
    try {
      response = await fetch(`${base}/auth/me`, { headers: { Authorization: authorization },
        redirect: 'error', signal: AbortSignal.timeout(3000) });
    } catch { throw new ServiceUnavailableException('Không xác minh được phiên đăng nhập.'); }
    if (response.status === 401) throw new UnauthorizedException('Phiên đăng nhập hết hạn.');
    if (response.status === 403) throw new ForbiddenException('Tài khoản không có quyền truy cập.');
    if (!response.ok) throw new ServiceUnavailableException('Không xác minh được phiên đăng nhập.');

    let principal: unknown;
    try { principal = await response.json(); }
    catch { throw new ServiceUnavailableException('Core trả dữ liệu không hợp lệ.'); }
    if (!principal || typeof principal !== 'object')
      throw new ServiceUnavailableException('Core trả dữ liệu không hợp lệ.');
    const user = principal as Record<string, unknown>;
    if (!Array.isArray(user.roles) || !user.roles.some(role => role === 'LIBRARIAN' || role === 'ADMIN'))
      throw new ForbiddenException('Chỉ nhân viên được xem đề xuất bổ sung sách.');
    if (typeof user.id !== 'string' || !isUUID(user.id))
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');

    const now = Date.now();
    for (const [id, window] of this.windows) if (now - window.start >= 60_000) this.windows.delete(id);
    const window = this.windows.get(user.id) ?? { start: now, count: 0 };
    if (window.count >= 60 || (!this.windows.has(user.id) && this.windows.size >= 1000)) {
      const retryAfter = Math.max(1, Math.ceil((60_000 - (now - window.start)) / 1000));
      context.switchToHttp().getResponse<ExpressResponse>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException('Đã đạt giới hạn truy cập đề xuất. Vui lòng thử lại sau.', 429);
    }
    window.count++;
    this.windows.set(user.id, window);
    (request as Request & { [acquisitionActor]?: string })[acquisitionActor] = user.id;
    return true;
  }
}
