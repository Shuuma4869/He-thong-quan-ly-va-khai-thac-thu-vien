import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { getMedia, type Media, type MediaKind } from './media-api';
import { GoogleAttribution, SourceLink } from './SourceLink';

export function CatalogMedia({kind,id,title}:{kind:MediaKind;id:string;title:string}) {
  const {user}=useAuth();
  const result=useQuery({queryKey:['catalog-media',user?.id,kind,id],queryFn:({signal})=>getMedia(kind,id,signal),retry:false,staleTime:60_000});
  const fallback=kind==='authors'?<div className="author-initials" aria-label="Chưa có ảnh tác giả đã xác minh">{title.split(/\s+/).filter(Boolean).slice(-2).map(part=>part[0]).join('')}</div>
    :<div className="book-placeholder" aria-label="Chưa có bìa đã xác minh"><span>LAMS</span><strong>{title}</strong></div>;
  if (!result.data) return <>{fallback}{result.isError && <p className="text-sm text-muted">Chưa tải được thông tin ảnh. Dữ liệu Catalog vẫn hiển thị bình thường.</p>}</>;
  const content=<ApprovedImage key={result.data.imageUrl} media={result.data} title={title} fallback={fallback} />;
  return result.data.source==='google-books'?<GoogleAttribution>{content}</GoogleAttribution>:content;
}
function ApprovedImage({media,title,fallback}:{media:Media;title:string;fallback:React.ReactNode}) {
  const [failed,setFailed]=useState(false);
  return <figure>{failed?fallback:<img className="catalog-approved-image" src={media.imageUrl} alt={title} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)} />}
    <figcaption className="mt-3 text-sm text-muted"><p>{media.attribution}</p><SourceLink href={media.sourceUrl}>Nguồn: {media.source}</SourceLink>{' · '}<SourceLink href={media.licenseUrl}>{media.license}</SourceLink>
      <p className="mt-1">Đã được nhân viên duyệt · {new Date(media.approvedAt).toLocaleDateString('vi-VN')}</p></figcaption>
  </figure>;
}
