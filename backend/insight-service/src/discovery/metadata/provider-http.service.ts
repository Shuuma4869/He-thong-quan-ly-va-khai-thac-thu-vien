import { Injectable } from '@nestjs/common';

export class ProviderFailure extends Error {
  constructor(readonly reason: 'unavailable' | 'rate-limited' | 'not-found' | 'invalid') { super(reason); }
}
const HOSTS = new Set(['openlibrary.org','covers.openlibrary.org','www.googleapis.com','www.wikidata.org','commons.wikimedia.org','upload.wikimedia.org','books.google.com']);
@Injectable()
export class ProviderHttp {
  private readonly next = new Map<string,number>();
  private active = 0;
  private readonly cache = new Map<string,{ expires:number; value:unknown }>();
  private readonly pending = new Map<string,Promise<unknown>>();

  async json(url: string): Promise<unknown> {
    const cached=this.cache.get(url);
    if (cached && cached.expires>Date.now()) return cached.value;
    if (this.pending.has(url)) return this.pending.get(url)!;
    const work = this.loadJson(url).finally(() => this.pending.delete(url));
    this.pending.set(url,work); return work;
  }
  private async loadJson(url: string): Promise<unknown> {
    const { body,mime }=await this.read(url,1024*1024);
    if (!mime.includes('json')) throw new ProviderFailure('invalid');
    let value:unknown;
    try { value=JSON.parse(body.toString('utf8')); } catch { throw new ProviderFailure('invalid'); }
    if (this.cache.size>=200) this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(url,{ expires:Date.now()+10*60_000,value }); return value;
  }
  async read(raw: string, maxBytes: number): Promise<{ body:Buffer; mime:string }> {
    const url=new URL(raw);
    if (url.protocol!=='https:' || url.username || url.password || url.port || !HOSTS.has(url.hostname)) throw new ProviderFailure('invalid');
    if (this.active>=4) throw new ProviderFailure('rate-limited');
    const now=Date.now(), available=this.next.get(url.hostname)??0;
    // One request/second/host; bounded queue, no unbounded retries after 429.
    if (available-now>3000) throw new ProviderFailure('rate-limited');
    this.next.set(url.hostname,Math.max(now,available)+1100); this.active++;
    const controller=new AbortController();
    const timer=setTimeout(() => controller.abort(),5000);
    try {
      if (available>now) await new Promise(resolve => setTimeout(resolve,available-now));
      const response=await fetch(url,{ signal:controller.signal,redirect:'error',headers:{
        'User-Agent': process.env.METADATA_USER_AGENT || 'LAMS/0.1 (library catalog lookup)', Accept:'application/json,image/jpeg,image/png,image/webp',
      } });
      if (!response.ok) throw new ProviderFailure(response.status===429?'rate-limited':response.status===404?'not-found':'unavailable');
      const size=Number(response.headers.get('content-length'));
      if (size>maxBytes) { await response.body?.cancel(); throw new ProviderFailure('invalid'); }
      const reader=response.body?.getReader(); if (!reader) throw new ProviderFailure('invalid');
      const chunks:Buffer[]=[]; let received=0;
      try {
        while (true) {
          const chunk=await reader.read(); if (chunk.done) break;
          received+=chunk.value.byteLength;
          if (received>maxBytes) { await reader.cancel(); throw new ProviderFailure('invalid'); }
          chunks.push(Buffer.from(chunk.value));
        }
      } finally { reader.releaseLock(); }
      return { body:Buffer.concat(chunks),mime:(response.headers.get('content-type')??'').split(';')[0].trim().toLowerCase() };
    } catch (error) { if (error instanceof ProviderFailure) throw error; throw new ProviderFailure('unavailable'); }
    finally { clearTimeout(timer); this.active--; }
  }
}
