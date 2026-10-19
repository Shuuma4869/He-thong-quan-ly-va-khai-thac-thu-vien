import { Injectable } from '@nestjs/common';
import { ProviderFailure, ProviderHttp } from './provider-http.service';
import { array, httpsUrl, object, string, type BookMetadataProvider, type ProviderResult, type MediaCandidate } from './metadata.types';

@Injectable()
export class OpenLibraryProvider implements BookMetadataProvider {
  constructor(private readonly http:ProviderHttp) {}
  async lookup(isbn13:string):Promise<ProviderResult> {
    try {
      const response=object(await this.http.json(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn13}&format=json&jscmd=data`));
      const data=object(response[`ISBN:${isbn13}`]);
      const identifiers=object(data.identifiers);
      if (!array(identifiers.isbn_13).includes(isbn13)) return { status:'not-found',candidate:null };
      // The Books API still emits HTTP page links. Upgrade only its own host;
      // image URLs and every outbound request remain HTTPS-only.
      const page=new URL(string(data.url));
      if (page.protocol==='http:' && page.hostname==='openlibrary.org' && !page.port && !page.username && !page.password) page.protocol='https:';
      const sourceUrl=httpsUrl(page.href,['openlibrary.org']),title=string(data.title);
      if (!sourceUrl || !title || title.length>1000) return { status:'invalid',candidate:null };
      const fetchedAt=new Date().toISOString(), cover=object(data.cover);
      const image=httpsUrl(cover.large ?? cover.medium,['covers.openlibrary.org']);
      const media:MediaCandidate|null=image ? { source:'open-library',source_id:string(data.key)||isbn13,source_url:sourceUrl,
        image_url:image,thumbnail_url:httpsUrl(cover.medium,['covers.openlibrary.org'])??image,
        license:null,attribution:null,verified:false,fetched_at:fetchedAt,evidence:{isbn13},mime:null,bytes:null } : null;
      return { status:'ok',candidate:{ source:'open-library',sourceId:string(data.key)||isbn13,sourceUrl,fetchedAt,title,
        authors:array(data.authors).map(author=>string(object(author).name)).filter(Boolean).slice(0,100),isbn13,media } };
    } catch (error) { return { status:error instanceof ProviderFailure?error.reason:'invalid',candidate:null }; }
  }
}
