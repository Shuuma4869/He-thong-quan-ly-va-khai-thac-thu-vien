import { BookOpen, UserRound } from 'lucide-react';
import { useState } from 'react';
import type { DirectoryImage } from './directory-image-api';

export function DirectoryVisual({ kind, title, image }: { kind: 'authors' | 'categories'; title: string; image?: DirectoryImage }) {
  const [failed, setFailed] = useState(false);
  const fallback = <div className="directory-visual-fallback" aria-label={kind === 'authors' ? 'Chưa có chân dung đã duyệt' : 'Chưa có bìa phù hợp đã duyệt'}>
    {kind === 'authors' ? <UserRound size={38} aria-hidden="true"/> : <BookOpen size={38} aria-hidden="true"/>}</div>;
  if (!image || failed) return fallback;
  return <figure className="directory-visual">
    <img src={image.imageUrl} alt={kind === 'authors' ? `Chân dung tác giả ${title}` : `Bìa sách thuộc thể loại ${title}`}
      loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/>
    <figcaption>{kind === 'categories' ? 'Bìa sách cùng thể loại' : 'Chân dung đã duyệt'} · {image.attribution}</figcaption>
  </figure>;
}
