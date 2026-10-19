import { BadRequestException, Injectable } from '@nestjs/common';
import { OpenLibraryProvider } from './open-library.service';
import { GoogleBooksProvider } from './google-books.service';
import { WikimediaProvider } from './wikimedia.service';
import { MediaNormalizer } from './media-normalizer.service';

@Injectable()
export class MetadataService {
  constructor(private readonly openLibrary:OpenLibraryProvider,private readonly google:GoogleBooksProvider,
    private readonly wikimedia:WikimediaProvider,private readonly media:MediaNormalizer) {}
  async book(isbn13:string) {
    if (!/^\d{13}$/.test(isbn13)) throw new BadRequestException('ISBN phải gồm đúng 13 chữ số.');
    const first=await this.openLibrary.lookup(isbn13);
    const attempts=[{provider:'open-library',status:first.status}];
    // Keep an existing candidate, including manual staff data in Core. Fallback is supplementary only.
    if (first.candidate?.title && first.candidate.media) return {attempts,candidates:[first.candidate]};
    const fallback=await this.google.lookup(isbn13); attempts.push({provider:'google-books',status:fallback.status});
    return {attempts,candidates:[first.candidate,fallback.candidate].filter(candidate=>candidate!==null)};
  }
  async author(openLibraryId:string) {
    if (!/^OL[1-9]\d*A$/.test(openLibraryId)) throw new BadRequestException('Định danh tác giả Open Library không hợp lệ.');
    const result=await this.wikimedia.author(openLibraryId);
    const normalized=result.media?await this.media.normalize([result.media]):[];
    return {status:result.media && !normalized.length?'invalid':result.status,candidates:normalized};
  }
}
