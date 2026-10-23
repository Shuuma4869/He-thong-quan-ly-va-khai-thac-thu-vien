import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Request, Response as ExpressResponse } from 'express';
import { array, object, string } from './metadata.types';
import { metadataRateGroup } from './metadata-rate-limit';

export const metadataActor = Symbol('metadataActor');

@Injectable()
export class MetadataGuard implements CanActivate {
  private readonly windows=new Map<string,{start:number;provider:number;history:number}>();
  async canActivate(context:ExecutionContext):Promise<boolean> {
    const request=context.switchToHttp().getRequest<Request>();
    const authorization=request.headers.authorization;
    if (!authorization || !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization) || authorization.length>8192) throw new UnauthorizedException('Cần đăng nhập.');
    const base=process.env.CORE_API_URL || 'http://localhost:8080/api/v1';
    const url=new URL(base);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname!=='/api/v1') throw new ServiceUnavailableException('Core API chưa được cấu hình đúng.');
    let response:Response;
    try { response=await fetch(`${base}/auth/me`,{headers:{Authorization:authorization},redirect:'error',signal:AbortSignal.timeout(3000)}); }
    catch { throw new ServiceUnavailableException('Không xác minh được phiên đăng nhập.'); }
    if (response.status===401) throw new UnauthorizedException('Phiên đăng nhập hết hạn.');
    if (response.status===403) throw new ForbiddenException('Tài khoản không có quyền truy cập.');
    if (!response.ok) throw new ServiceUnavailableException('Không xác minh được phiên đăng nhập.');
    let user:Record<string,unknown>;
    try { user=object(await response.json()); } catch { throw new ServiceUnavailableException('Core trả dữ liệu không hợp lệ.'); }
    if (!array(user.roles).some(role=>role==='LIBRARIAN'||role==='ADMIN')) throw new ForbiddenException('Chỉ nhân viên được tra metadata.');
    const id=string(user.id); if (!id) throw new UnauthorizedException('Phiên đăng nhập không hợp lệ.');
    const now=Date.now();
    for (const [key,value] of this.windows) if (now-value.start>=60_000) this.windows.delete(key);
    const group = Reflect.getMetadata(metadataRateGroup, context.getHandler()) === 'history' ? 'history' : 'provider';
    const limit = group === 'history' ? 60 : 10;
    const window=this.windows.get(id)??{start:now,provider:0,history:0};
    if (window[group]>=limit || (!this.windows.has(id) && this.windows.size>=1000)) {
      const retryAfter = Math.max(1, Math.ceil((60_000 - (now - window.start)) / 1000));
      context.switchToHttp().getResponse<ExpressResponse>().setHeader('Retry-After', String(retryAfter));
      throw new HttpException(group === 'history'
        ? 'Đã đạt giới hạn đọc/xóa lịch sử. Vui lòng thử lại sau.'
        : 'Đã đạt giới hạn tra cứu nguồn metadata. Vui lòng thử lại sau.',429);
    }
    window[group]++; this.windows.set(id,window);
    (request as Request & { [metadataActor]?: string })[metadataActor] = id;
    return true;
  }
}
