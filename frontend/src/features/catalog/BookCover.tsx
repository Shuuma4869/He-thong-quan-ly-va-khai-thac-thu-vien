import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { PublicCover } from './catalog-api';
import { safeMediaUrl } from './media-api';

export function BookCover({ title, cover }: { title: string; cover?: PublicCover | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!cover || !safeMediaUrl(cover.imageUrl) || failedUrl === cover.imageUrl) {
    return <div className="book-placeholder book-cover" aria-label="Chưa có bìa đã xác minh">
      <span>LAMS · THƯ VIỆN</span><BookOpen size={45} strokeWidth={1.2} aria-hidden="true"/><strong>Bìa đang cập nhật</strong>
    </div>;
  }
  return <figure className="book-cover-wrap">
    <img className="book-cover" src={cover.imageUrl} alt={`Bìa sách ${title}`} loading="lazy"
      referrerPolicy="no-referrer" onError={() => setFailedUrl(cover.imageUrl)} />
    <figcaption className="book-cover-credit" title={cover.attribution}>{cover.attribution}</figcaption>
  </figure>;
}
