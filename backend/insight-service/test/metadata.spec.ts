import { BadRequestException } from '@nestjs/common';
import { OpenLibraryProvider } from '../src/discovery/metadata/open-library.service';
import { GoogleBooksProvider } from '../src/discovery/metadata/google-books.service';
import { WikimediaProvider } from '../src/discovery/metadata/wikimedia.service';
import { MediaNormalizer } from '../src/discovery/metadata/media-normalizer.service';
import { ProviderHttp,ProviderFailure } from '../src/discovery/metadata/provider-http.service';
import { MetadataService } from '../src/discovery/metadata/metadata.service';
import type { MediaCandidate,ProviderResult } from '../src/discovery/metadata/metadata.types';

const isbn='9780140328721';
const media:MediaCandidate={source:'wikimedia',source_id:'Q1:Writer.jpg',source_url:'https://commons.wikimedia.org/wiki/File:Writer.jpg',
  image_url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Writer.jpg',thumbnail_url:'https://upload.wikimedia.org/wikipedia/commons/a/ab/Writer.jpg',
  license:'CC BY-SA 4.0',attribution:'Photographer',verified:false,fetched_at:'2026-10-18T00:00:00Z',evidence:{openLibraryAuthorId:'OL1A',wikidataId:'Q1'},mime:'image/jpeg',bytes:3};
const result:ProviderResult={status:'ok',candidate:{source:'open-library',sourceId:'OL1M',sourceUrl:'https://openlibrary.org/books/OL1M',fetchedAt:media.fetched_at,title:'Book',authors:['Writer'],isbn13:isbn,media:{...media,source:'open-library'}}};
let http:ProviderHttp;
let json:jest.Mock,read:jest.Mock;
const previousKey=process.env.GOOGLE_BOOKS_API_KEY,previousEnabled=process.env.GOOGLE_BOOKS_ENABLED;
beforeEach(()=>{json=jest.fn();read=jest.fn().mockResolvedValue({body:Buffer.from([255,216,255]),mime:'image/jpeg'});http={json,read} as unknown as ProviderHttp;});
afterEach(()=>{jest.restoreAllMocks();jest.useRealTimers();if(previousKey===undefined)delete process.env.GOOGLE_BOOKS_API_KEY;else process.env.GOOGLE_BOOKS_API_KEY=previousKey;if(previousEnabled===undefined)delete process.env.GOOGLE_BOOKS_ENABLED;else process.env.GOOGLE_BOOKS_ENABLED=previousEnabled;});

test('Open Library validates exact ISBN and keeps provenance without asserting image rights',async()=>{
  json.mockResolvedValue({[`ISBN:${isbn}`]:{title:'Book',url:'https://openlibrary.org/books/OL1M',identifiers:{isbn_13:[isbn]},authors:[{name:'Writer'}],cover:{large:'https://covers.openlibrary.org/b/id/1-L.jpg'}}});
  const output=await new OpenLibraryProvider(http).lookup(isbn);
  expect(output.status).toBe('ok');expect(output.candidate?.media).toMatchObject({verified:false,license:null,evidence:{isbn13:isbn}});
});
test.each(['not-found','unavailable','rate-limited','invalid'] as const)('Open Library %s is explicit and does not throw into Core',async status=>{
  json.mockRejectedValue(new ProviderFailure(status));expect(await new OpenLibraryProvider(http).lookup(isbn)).toEqual({status,candidate:null});
});
test('missing or wrong ISBN is not a match',async()=>{
  json.mockResolvedValue({[`ISBN:${isbn}`]:{title:'Wrong',identifiers:{isbn_13:['0000000000000']}}});
  expect((await new OpenLibraryProvider(http).lookup(isbn)).candidate).toBeNull();
});
test('Open Library upgrades legacy page links without relaxing image transport',async()=>{
  json.mockResolvedValue({[`ISBN:${isbn}`]:{title:'Book',url:'http://openlibrary.org/books/OL1M',identifiers:{isbn_13:[isbn]},cover:{large:'http://covers.openlibrary.org/b/id/1-L.jpg'}}});
  const output=await new OpenLibraryProvider(http).lookup(isbn);
  expect(output.status).toBe('ok');expect(output.candidate?.sourceUrl).toBe('https://openlibrary.org/books/OL1M');expect(output.candidate?.media).toBeNull();
});
test.each(['http://openlibrary.org.evil.test/books/OL1M','http://user@openlibrary.org/books/OL1M','http://openlibrary.org:8080/books/OL1M'])('Open Library rejects unsafe page link %s',async url=>{
  json.mockResolvedValue({[`ISBN:${isbn}`]:{title:'Book',url,identifiers:{isbn_13:[isbn]}}});
  expect((await new OpenLibraryProvider(http).lookup(isbn)).status).toBe('invalid');
});
test('Google Books is not called without server configuration',async()=>{
  delete process.env.GOOGLE_BOOKS_API_KEY;delete process.env.GOOGLE_BOOKS_ENABLED;
  expect((await new GoogleBooksProvider(http).lookup(isbn)).status).toBe('not-configured');expect(json).not.toHaveBeenCalled();
});
test('Google Books accepts one exact ISBN, rejects ambiguity and does not expose API key',async()=>{
  process.env.GOOGLE_BOOKS_ENABLED='true';process.env.GOOGLE_BOOKS_API_KEY='test-key';
  const item={id:'volume123',volumeInfo:{title:'Book',industryIdentifiers:[{type:'ISBN_13',identifier:isbn}],authors:['Writer']}};
  json.mockResolvedValue({items:[item]});const output=await new GoogleBooksProvider(http).lookup(isbn);
  expect(output.status).toBe('ok');expect(JSON.stringify(output)).not.toContain('test-key');
  json.mockResolvedValue({items:[item,item]});expect((await new GoogleBooksProvider(http).lookup(isbn)).status).toBe('invalid');
});
test('fallback only fills missing provider results and never overwrites the first candidate',async()=>{
  const open={lookup:jest.fn().mockResolvedValue(result)},google={lookup:jest.fn().mockResolvedValue({...result,candidate:{...result.candidate!,source:'google-books'}})};
  const service=new MetadataService(open as unknown as OpenLibraryProvider,google as unknown as GoogleBooksProvider,{} as WikimediaProvider,{} as MediaNormalizer);
  expect((await service.book(isbn)).candidates).toHaveLength(1);expect(google.lookup).not.toHaveBeenCalled();
  open.lookup.mockResolvedValue({...result,candidate:{...result.candidate!,media:null}});
  const fallback=await service.book(isbn);expect(fallback.candidates).toHaveLength(2);expect(fallback.candidates[0].source).toBe('open-library');
  await expect(service.book('invalid')).rejects.toBeInstanceOf(BadRequestException);
});
function authorResponses({reverse='OL1A',license='CC BY-SA 4.0'}={}) {
  json.mockResolvedValueOnce({key:'/authors/OL1A',remote_ids:{wikidata:'Q1'}})
    .mockResolvedValueOnce({entities:{Q1:{claims:{P648:[{mainsnak:{datavalue:{value:reverse}}}],P18:[{mainsnak:{datavalue:{value:'Writer.jpg'}}}]}}}})
    .mockResolvedValueOnce({query:{pages:{'1':{imageinfo:[{url:media.image_url,descriptionurl:media.source_url,mime:'image/jpeg',size:3,
      extmetadata:{LicenseShortName:{value:license},Artist:{value:'<a>Photographer</a>'}}}]}}}});
}
test('Wikimedia requires linked identifiers both ways, not similar author names',async()=>{
  authorResponses({reverse:'OL2A'});expect((await new WikimediaProvider(http).author('OL1A')).status).toBe('invalid');expect(json).toHaveBeenCalledTimes(2);
});
test('Wikimedia missing license is rejected',async()=>{authorResponses({license:''});expect((await new WikimediaProvider(http).author('OL1A')).media).toBeNull();});
test('Wikimedia keeps linked identity and plain-text attribution',async()=>{authorResponses();expect((await new WikimediaProvider(http).author('OL1A')).media).toMatchObject({license:'CC BY-SA 4.0',attribution:'Photographer',evidence:{openLibraryAuthorId:'OL1A',wikidataId:'Q1'},verified:false});});
test('normalizer deduplicates without dropping attribution or marking manually approved',async()=>{
  const output=await new MediaNormalizer(http).normalize([media,media]);expect(output).toHaveLength(1);expect(read).toHaveBeenCalledTimes(1);expect(output[0]).toMatchObject({attribution:media.attribution,evidence:media.evidence,verified:false});
});
test.each([
  {...media,license:null},{...media,attribution:null},{...media,bytes:3*1024*1024},
  {...media,image_url:'http://127.0.0.1/private'},
])('unsafe or unlicensed image rejected before fetching',async candidate=>{expect(await new MediaNormalizer(http).normalize([candidate])).toEqual([]);expect(read).not.toHaveBeenCalled();});
test.each([{body:Buffer.from('not a jpeg'),mime:'image/jpeg'},{body:Buffer.from('<svg/>'),mime:'image/svg+xml'}])('MIME plus signature check rejects invalid image',async response=>{read.mockResolvedValue(response);expect(await new MediaNormalizer(http).normalize([media])).toEqual([]);});
test('provider HTTP cache deduplicates and caps JSON size without a live provider',async()=>{
  const fetch=jest.spyOn(globalThis,'fetch').mockResolvedValue(Response.json({title:'Book'}));
  const transport=new ProviderHttp();const url='https://openlibrary.org/api/books?test=1';
  expect(await transport.json(url)).toEqual({title:'Book'});await transport.json(url);expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(expect.any(URL),expect.objectContaining({redirect:'error',signal:expect.any(AbortSignal)}));
  await expect(transport.json('https://localhost/private')).rejects.toMatchObject({reason:'invalid'});
});
test('provider timeout aborts pending fetch and releases its slot',async()=>{
  jest.useFakeTimers();jest.spyOn(globalThis,'fetch').mockImplementation((_url,options)=>new Promise((_resolve,reject)=>{
    options!.signal!.addEventListener('abort',()=>reject(new Error('timeout')));
  }));
  const assertion=expect(new ProviderHttp().json('https://openlibrary.org/api/books?test=2')).rejects.toMatchObject({reason:'unavailable'});
  await jest.advanceTimersByTimeAsync(5001);await assertion;
});
