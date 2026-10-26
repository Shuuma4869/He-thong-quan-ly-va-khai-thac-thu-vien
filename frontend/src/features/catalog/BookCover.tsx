import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { PublicCover } from './catalog-api';
import { safeMediaUrl } from './media-api';

export function BookCover({ title, cover }: { title: string; cover?: PublicCover | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!cover || !safeMediaUrl(cover.imageUrl) || failedUrl === cover.imageUrl) {
    const tone = [...title].reduce((value, character) => (value * 31 + character.codePointAt(0)!) % 6, 0);
    return <div className={`book-placeholder book-cover book-placeholder-tone-${tone}`} aria-label="Chưa có bìa đã xác minh">
      <span>LAMS · THƯ VIỆN</span><BookOpen size={42} strokeWidth={1.1} aria-hidden="true"/>
      <strong title={title}>{title}</strong><small>Chưa có ảnh bìa được duyệt</small>
    </div>;
  }
  return <figure className="book-cover-wrap">
    <img className="book-cover" src={cover.imageUrl} alt={`Bìa sách ${title}`} loading="lazy"
      referrerPolicy="no-referrer" onError={() => setFailedUrl(cover.imageUrl)} />
    <figcaption className="book-cover-credit" title={cover.attribution}>{cover.attribution}</figcaption>
  </figure>;
}
