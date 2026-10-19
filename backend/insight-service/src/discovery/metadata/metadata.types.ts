export type Provider = 'open-library' | 'google-books' | 'wikimedia';
export type ProviderStatus = 'ok' | 'not-found' | 'unavailable' | 'rate-limited' | 'not-configured' | 'invalid';
export interface MediaCandidate {
  source: Provider; source_id: string; source_url: string; image_url: string; thumbnail_url: string;
  license: string | null; attribution: string | null; verified: false; fetched_at: string;
  evidence: { isbn13?: string; openLibraryAuthorId?: string; wikidataId?: string };
  mime: string | null; bytes: number | null;
}
export interface MetadataCandidate {
  source: Provider; sourceId: string; sourceUrl: string; fetchedAt: string;
  title: string; authors: string[]; isbn13: string; media: MediaCandidate | null;
}
export interface ProviderResult { status: ProviderStatus; candidate: MetadataCandidate | null }
export interface BookMetadataProvider { lookup(isbn13: string): Promise<ProviderResult> }
export const object = (value: unknown): Record<string,unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string,unknown> : {};
export const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
export const string = (value: unknown): string => typeof value === 'string' ? value : '';
export const httpsUrl = (value: unknown, hosts: string[]): string | null => {
  try { const url=new URL(string(value)); return url.protocol==='https:' && !url.username && !url.password && !url.port && hosts.includes(url.hostname) ? url.href : null; } catch { return null; }
};
