import { Injectable } from '@nestjs/common';
import { ProviderHttp } from './provider-http.service';
import { httpsUrl, type MediaCandidate } from './metadata.types';

@Injectable()
export class MediaNormalizer {
  constructor(private readonly http:ProviderHttp) {}
  async normalize(candidates:MediaCandidate[]):Promise<MediaCandidate[]> {
    const result:MediaCandidate[]=[],seen=new Set<string>();
    for (const candidate of candidates.slice(0,5)) {
      const key=`${candidate.source}:${candidate.source_id}`;
      if (seen.has(key)) continue; seen.add(key);
      if (!candidate.license || !candidate.attribution || (!candidate.evidence.isbn13 && !candidate.evidence.openLibraryAuthorId)) continue;
      const hosts=candidate.source==='wikimedia'?['upload.wikimedia.org']:candidate.source==='open-library'?['covers.openlibrary.org']:['books.google.com'];
      if (!httpsUrl(candidate.image_url,hosts) || !httpsUrl(candidate.thumbnail_url,hosts)) continue;
      try {
        const maxBytes=2*1024*1024;
        if (candidate.bytes!==null && candidate.bytes>maxBytes) continue;
        const {body,mime}=await this.http.read(candidate.image_url,maxBytes);
        const valid=mime==='image/jpeg' && body[0]===0xff && body[1]===0xd8 && body[2]===0xff
          || mime==='image/png' && body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
          || mime==='image/webp' && body.toString('ascii',0,4)==='RIFF' && body.toString('ascii',8,12)==='WEBP';
        if (!valid || body.length===0) continue;
        result.push({...candidate,mime,bytes:body.length,verified:false});
      } catch { /* An unavailable image never prevents Catalog maintenance. */ }
    }
    return result;
  }
}
