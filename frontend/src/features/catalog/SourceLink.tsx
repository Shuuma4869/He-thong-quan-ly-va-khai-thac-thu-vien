import { useState, type ReactNode } from 'react';
import { safeMediaUrl } from './media-api';

export function SourceLink({ href,children }: { href:string;children:ReactNode }) {
  const [error,setError]=useState(false);
  if (!safeMediaUrl(href)) return <span>Nguồn không hợp lệ</span>;
  return <><a className="text-link" href={href} target="_blank" rel="noopener noreferrer" onClick={event => {
    const native=window as unknown as {__TAURI__?:{core:{invoke:(command:string,args:unknown)=>Promise<unknown>}}};
    if (native.__TAURI__) { event.preventDefault(); void native.__TAURI__.core.invoke('open_catalog_source',{url:href}).catch(() => setError(true)); }
  }}>{children}</a>{error && <small role="alert">Không mở được trình duyệt. Nguồn: {href}</small>}</>;
}
export function GoogleAttribution({ children }: {children:ReactNode}) {
  const [loaded,setLoaded]=useState(false); const [failed,setFailed]=useState(false);
  return <div className="mt-3"><img src="https://books.google.com/googlebooks/images/poweredby.png" alt="Powered by Google" width="62" height="30"
    referrerPolicy="no-referrer" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
    {loaded && !failed ? children : <p className="text-sm text-muted">{failed?'Không tải được attribution Google Books; nội dung nguồn này chưa hiển thị.':'Đang tải attribution Google Books…'}</p>}
  </div>;
}
