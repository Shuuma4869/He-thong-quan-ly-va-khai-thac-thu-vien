import { CanActivate, ExecutionContext, ForbiddenException, HttpException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { array, object, string } from './metadata.types';

export const metadataActor = Symbol('metadataActor');

@Injectable()
export class MetadataGuard implements CanActivate {
  private readonly windows=new Map<string,{start:number;count:number}>();
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
    const window=this.windows.get(id)??{start:now,count:0};
    if (window.count>=10 || (!this.windows.has(id) && this.windows.size>=1000)) throw new HttpException('Đã đạt giới hạn tra cứu, thử lại sau một phút.',429);
    window.count++; this.windows.set(id,window);
    (request as Request & { [metadataActor]?: string })[metadataActor] = id;
    return true;
  }
}
