import { useQuery } from '@tanstack/react-query';
import { BookOpen, Layers3, Search, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getBooks, getCatalogPage, type Book } from './catalog-api';
import { safeMediaUrl } from './media-api';
import { Dialog } from '../../shared/components/Dialog';

type Suggestion = { id: string; kind: 'book' | 'author' | 'category'; title: string; detail: string; href: string; cover?: string };
const searchHref = (term: string) => `/sach?${new URLSearchParams({ query: term, sort: 'relevance' })}`;

function markMatch(value: string, term: string) {
  const at = value.toLocaleLowerCase('vi-VN').indexOf(term.toLocaleLowerCase('vi-VN'));
  if (at < 0) return value;
  return <>{value.slice(0, at)}<mark>{value.slice(at, at + term.length)}</mark>{value.slice(at + term.length)}</>;
}

export function SearchCommand() {
  const navigate = useNavigate();
  const location = useLocation();
  const root = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [input, setInput] = useState('');
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const timeout = window.setTimeout(() => setTerm(input.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [input]);
  useEffect(() => { setOpen(false); setModal(false); setActive(-1); }, [location.pathname, location.search]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !(event.target as Element).closest?.('.search-dialog')) setOpen(false); };
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (window.matchMedia('(max-width: 760px)').matches) setModal(true);
        else inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', shortcut);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', shortcut); };
  }, []);
  const suggestions = useQuery({ queryKey: ['global-search', term], enabled: open && term.length >= 2,
    queryFn: async ({ signal }) => {
      const [books, authors, categories] = await Promise.all([
        getBooks({ query: term, authorId: '', categoryId: '', categoryTerm: '', page: 0, size: 4, sort: 'relevance' }, signal),
        getCatalogPage('authors', 0, signal, undefined, term, 4),
        getCatalogPage('categories', 0, signal, undefined, term, 4),
      ]);
      return [
        ...books.items.map((book: Book): Suggestion => ({ id: book.id, kind: 'book', title: book.title,
          detail: book.authors.map(author => author.name).join(', ') || 'Tác phẩm', href: `/sach/${book.id}`,
          cover: book.cover && safeMediaUrl(book.cover.imageUrl) ? book.cover.imageUrl : undefined })),
        ...authors.items.map((author): Suggestion => ({ id: author.id, kind: 'author', title: author.name,
          detail: 'Tác giả', href: `/tac-gia/${author.id}` })),
        ...categories.items.map((category): Suggestion => ({ id: category.id, kind: 'category', title: category.name,
          detail: 'Thể loại', href: `/the-loai/${category.id}` })),
      ];
    }, staleTime: 30_000, retry: false });
  const items = suggestions.data ?? [];
  const choose = (href: string) => { setOpen(false); setModal(false); setActive(-1); navigate(href); };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setModal(false); setActive(-1); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) setOpen(true);
      if (!items.length || term !== input.trim() || !suggestions.isSuccess) return;
      event.preventDefault();
      setActive(index => event.key === 'ArrowDown' ? (index + 1) % items.length : (index + items.length - 1) % items.length);
    }
    if (event.key === 'Enter' && open && term === input.trim() && suggestions.isSuccess && active >= 0 && items[active]) { event.preventDefault(); choose(items[active].href); }
  };
  const visible = open && input.trim().length >= 2;
  const ready = term === input.trim() && suggestions.isSuccess;
  const contents = <>
    <form role="search" onSubmit={event => { event.preventDefault(); if (input.trim()) choose(searchHref(input.trim())); }}>
      <Search size={18} aria-hidden="true"/>
      <input ref={inputRef} type="search" role="combobox" aria-label="Tìm sách, tác giả và thể loại"
        aria-autocomplete="list" aria-controls={visible ? 'global-search-results' : undefined} aria-expanded={visible}
        aria-activedescendant={visible && ready && active >= 0 && items[active] ? `global-search-option-${active}` : undefined}
        placeholder="Tìm sách, tác giả, thể loại…" value={input} maxLength={150}
        onChange={event => { setInput(event.target.value); setActive(-1); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={keyDown}/>
      <kbd>Ctrl K</kbd>
    </form>
    {visible && <div className="search-command-popover">
      {term !== input.trim() || suggestions.isPending ? <p role="status">Đang tìm trong danh mục…</p>
        : suggestions.isError ? <p role="alert">Chưa tải được gợi ý. Nhấn Enter để xem trang kết quả.</p>
          : !items.length && <p role="status">Không tìm thấy gợi ý phù hợp.</p>}
      <div id="global-search-results" role="listbox" aria-label="Gợi ý tìm kiếm">
        {ready && items.map((item, index) => <Link key={`${item.kind}-${item.id}`} id={`global-search-option-${index}`}
            className={`search-command-item ${active === index ? 'is-active' : ''}`} to={item.href} role="option"
            tabIndex={-1} aria-selected={active === index} onMouseEnter={() => setActive(index)} onClick={() => { setOpen(false); setModal(false); setActive(-1); }}>
            <span className="search-command-image">{item.cover ? <img src={item.cover} alt="" loading="lazy" referrerPolicy="no-referrer"/>
              : item.kind === 'book' ? <BookOpen size={20}/> : item.kind === 'author' ? <UserRound size={20}/> : <Layers3 size={20}/>}</span>
            <span><strong>{markMatch(item.title, term)}</strong><small>{item.detail}</small></span><em>{item.kind === 'book' ? 'Sách' : item.kind === 'author' ? 'Tác giả' : 'Thể loại'}</em>
          </Link>)}
      </div>
      <Link className="search-command-all" to={searchHref(input.trim())} onClick={() => setOpen(false)}>Xem tất cả kết quả “{input.trim()}” →</Link>
    </div>}
    {modal && !visible && <p className="search-hint">Nhập ít nhất hai ký tự để xem gợi ý. Nhấn Enter để tìm trong toàn bộ danh mục.</p>}
  </>;
  return <div className="search-command" ref={root}>
    <button type="button" className="search-mobile-trigger" onClick={() => { setModal(true); setOpen(true); }}
      aria-label="Mở tìm kiếm" aria-haspopup="dialog"><Search size={20}/><span>Tìm kiếm</span></button>
    {modal ? <Dialog title="Tìm trong thư viện" className="search-dialog" initialFocus={inputRef} onClose={() => { setModal(false); setOpen(false); }}>{contents}</Dialog>
      : <div className="search-inline">{contents}</div>}
  </div>;
}
