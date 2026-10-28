import { BookOpen } from 'lucide-react';
import { useState } from 'react';
import type { DirectoryImage } from './directory-image-api';
import { categoryEditorialPhoto } from './category-editorial';

export function DirectoryVisual({ kind, title, image }: { kind: 'authors' | 'categories'; title: string; image?: DirectoryImage }) {
  const [failedKey, setFailedKey] = useState('');
  const [editorialFailedKey, setEditorialFailedKey] = useState('');
  const editorial = kind === 'categories' ? categoryEditorialPhoto(title) : null;
  const imageKey = `${kind}:${title}:${image?.imageUrl ?? ''}`;
  const editorialKey = `${kind}:${title}:${editorial?.src ?? ''}`;
  const failed = failedKey === imageKey;
  const editorialFailed = editorialFailedKey === editorialKey;
  const fallback = <div className={`directory-visual-fallback directory-visual-${kind}`} aria-label={kind === 'authors' ? 'Chưa có chân dung đã duyệt' : 'Chưa có bìa phù hợp đã duyệt'}>
    <span className="directory-fallback-overline">{kind === 'authors' ? 'TÁC GIẢ' : 'TỦ SÁCH'}</span>
    <span className="directory-fallback-mark" aria-hidden="true">{kind === 'authors' ? title.trim().slice(0, 1).toLocaleUpperCase('vi-VN') : <BookOpen size={34} strokeWidth={1.3}/>}</span>
    <strong aria-hidden="true">{title}</strong><small>{kind === 'authors' ? 'Chân dung đang được xác minh' : 'Khám phá theo chủ đề'}</small></div>;
  if ((!image || failed) && editorial && !editorialFailed) return <figure className="directory-visual directory-visual-editorial">
    <img src={editorial.src} alt={editorial.alt} loading="lazy" decoding="async" onError={() => setEditorialFailedKey(editorialKey)}/>
    <figcaption>Ảnh minh họa chủ đề · {title}</figcaption>
  </figure>;
  if (!image || failed) return fallback;
  return <figure className="directory-visual">
    <img src={image.imageUrl} alt={kind === 'authors' ? `Chân dung tác giả ${title}` : `Bìa sách thuộc thể loại ${title}`}
      loading="lazy" referrerPolicy="no-referrer" onError={() => setFailedKey(imageKey)}/>
    <figcaption>{kind === 'categories' ? 'Bìa sách cùng thể loại' : 'Chân dung đã duyệt'} · {image.attribution}</figcaption>
  </figure>;
}
