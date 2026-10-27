import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { PublicCover } from './catalog-api';
import { safeMediaUrl } from './media-api';

export function BookCover({ title, author, cover }: { title: string; author?: string; cover?: PublicCover | null }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  if (!cover || !safeMediaUrl(cover.imageUrl) || failedUrl === cover.imageUrl) {
    const tone = [...title].reduce((value, character) => (value * 31 + character.codePointAt(0)!) % 6, 0);
    return <div className={`book-placeholder book-cover book-placeholder-tone-${tone}`} aria-label="Chưa có bìa đã xác minh">
      <div className="book-placeholder-top"><span>LAMS</span><span>THƯ VIỆN</span></div>
      <div className="book-placeholder-center"><BookOpen size={34} strokeWidth={1.2} aria-hidden="true"/>
        <span className="book-placeholder-rule" aria-hidden="true"/><strong title={title}>{title}</strong>
        {author && <span className="book-placeholder-author">{author}</span>}
      </div>
      <small>Chưa có ảnh bìa được duyệt</small>
    </div>;
  }
  return <figure className={`book-cover-wrap ${loadedUrl === cover.imageUrl ? 'is-loaded' : 'is-loading'}`}>
    {loadedUrl !== cover.imageUrl && <div className="book-cover-loading" aria-hidden="true"><BookOpen size={30} strokeWidth={1.1}/>
      <span>{title}</span><small>Đang tải ảnh bìa</small></div>}
    <img className="book-cover" src={cover.imageUrl} alt={`Bìa sách ${title}`} loading="lazy"
      decoding="async" referrerPolicy="no-referrer" onLoad={() => setLoadedUrl(cover.imageUrl)} onError={() => setFailedUrl(cover.imageUrl)} />
    <figcaption className="book-cover-credit" title={cover.attribution}>{cover.attribution}</figcaption>
  </figure>;
}
