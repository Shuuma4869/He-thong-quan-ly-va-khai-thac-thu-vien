import { Injectable } from '@nestjs/common';
import { ProviderFailure, ProviderHttp } from './provider-http.service';
import { array, object, string, httpsUrl, type BookMetadataProvider, type ProviderResult, type MediaCandidate } from './metadata.types';

@Injectable()
export class GoogleBooksProvider implements BookMetadataProvider {
  constructor(private readonly http:ProviderHttp) {}
  async lookup(isbn13:string):Promise<ProviderResult> {
    if (process.env.GOOGLE_BOOKS_ENABLED!=='true' || !process.env.GOOGLE_BOOKS_API_KEY) return {status:'not-configured',candidate:null};
    try {
      const url=new URL('https://www.googleapis.com/books/v1/volumes');
      url.searchParams.set('q',`isbn:${isbn13}`); url.searchParams.set('maxResults','10'); url.searchParams.set('key',process.env.GOOGLE_BOOKS_API_KEY);
      const data=object(await this.http.json(url.href));
      const matches=array(data.items).map(object).filter(item=>array(object(item.volumeInfo).industryIdentifiers)
        .some(entry=>object(entry).type==='ISBN_13' && object(entry).identifier===isbn13));
      // Ambiguous ISBN matches must not silently select a different edition.
      if (matches.length!==1) return {status:matches.length?'invalid':'not-found',candidate:null};
      const item=matches[0],info=object(item.volumeInfo),id=string(item.id),title=string(info.title);
      if (!/^[\w-]{1,100}$/.test(id) || !title || title.length>1000) return {status:'invalid',candidate:null};
      const sourceUrl=`https://books.google.com/books?id=${encodeURIComponent(id)}`,fetchedAt=new Date().toISOString();
      const image=httpsUrl(object(info.imageLinks).thumbnail,['books.google.com']);
      const media:MediaCandidate|null=image?{source:'google-books',source_id:id,source_url:sourceUrl,image_url:image,thumbnail_url:image,
        license:null,attribution:'Google Books',verified:false,fetched_at:fetchedAt,evidence:{isbn13},mime:null,bytes:null}:null;
      return {status:'ok',candidate:{source:'google-books',sourceId:id,sourceUrl,fetchedAt,title,
        authors:array(info.authors).map(string).filter(Boolean).slice(0,100),isbn13,media}};
    } catch (error) { return {status:error instanceof ProviderFailure?error.reason:'invalid',candidate:null}; }
  }
}
