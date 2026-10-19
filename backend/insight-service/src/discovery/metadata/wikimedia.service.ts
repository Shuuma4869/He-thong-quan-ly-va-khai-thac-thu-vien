import { Injectable } from '@nestjs/common';
import { ProviderFailure, ProviderHttp } from './provider-http.service';
import { array, object, string, httpsUrl, type MediaCandidate, type ProviderStatus } from './metadata.types';

@Injectable()
export class WikimediaProvider {
  constructor(private readonly http:ProviderHttp) {}
  async author(openLibraryAuthorId:string):Promise<{status:ProviderStatus;media:MediaCandidate|null}> {
    try {
      if (!/^OL[1-9]\d*A$/.test(openLibraryAuthorId)) return {status:'invalid',media:null};
      const author=object(await this.http.json(`https://openlibrary.org/authors/${openLibraryAuthorId}.json`));
      if (author.key!==`/authors/${openLibraryAuthorId}`) return {status:'invalid',media:null};
      const wikidataId=string(object(author.remote_ids).wikidata);
      // Open Library photos have no per-photo license here; use the linked Wikidata identity.
      if (!/^Q[1-9]\d*$/.test(wikidataId)) return {status:'not-found',media:null};
      const entity=object(object(object(await this.http.json(`https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`)).entities)[wikidataId]);
      const claims=object(entity.claims);
      const authorIds=array(claims.P648).filter(claim=>object(claim).rank!=='deprecated')
        .map(claim=>object(object(object(claim).mainsnak).datavalue).value);
      if (!authorIds.includes(openLibraryAuthorId)) return {status:'invalid',media:null};
      const photos=array(claims.P18).map(object).filter(claim=>claim.rank!=='deprecated');
      const preferred=photos.filter(claim=>claim.rank==='preferred');
      const selected=preferred.length?preferred:photos;
      if (selected.length!==1) return {status:'not-found',media:null};
      const file=string(object(object(selected[0].mainsnak).datavalue).value);
      if (!file || file.length>240 || /[\r\n|]/.test(file)) return {status:'invalid',media:null};
      const url=new URL('https://commons.wikimedia.org/w/api.php');
      url.search=new URLSearchParams({action:'query',format:'json',titles:`File:${file}`,prop:'imageinfo',iiprop:'url|mime|size|extmetadata',iiurlwidth:'320'}).toString();
      const pages=object(object(await this.http.json(url.href)).query).pages;
      const page=Object.values(object(pages)).map(object)[0]; const info=object(array(page?.imageinfo)[0]); const meta=object(info.extmetadata);
      const license=string(object(meta.LicenseShortName).value),attribution=string(object(meta.Artist).value).replace(/<[^>]*>/g,'').trim();
      const image=httpsUrl(info.url,['upload.wikimedia.org']),thumbnail=httpsUrl(info.thumburl,['upload.wikimedia.org']);
      const source=httpsUrl(info.descriptionurl,['commons.wikimedia.org']);
      if (!image || !source || !license || !attribution || !/^(CC0|Public domain|CC BY(?:-SA)? \d\.\d)$/i.test(license)) return {status:'invalid',media:null};
      return {status:'ok',media:{source:'wikimedia',source_id:`${wikidataId}:${file}`,source_url:source,image_url:image,thumbnail_url:thumbnail??image,
        license,attribution,verified:false,fetched_at:new Date().toISOString(),evidence:{openLibraryAuthorId,wikidataId},mime:string(info.mime)||null,
        bytes:typeof info.size==='number'?info.size:null}};
    } catch (error) { return {status:error instanceof ProviderFailure?error.reason:'invalid',media:null}; }
  }
}
