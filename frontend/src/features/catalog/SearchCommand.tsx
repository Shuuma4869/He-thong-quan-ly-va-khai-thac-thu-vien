import { useQuery } from '@tanstack/react-query';
import { BookOpen, Layers3, Search, UserRound } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { getBooks, getCatalogPage, type Book } from './catalog-api';
import { safeMediaUrl } from './media-api';

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
  const [active, setActive] = useState(-1);
  useEffect(() => {
    const timeout = window.setTimeout(() => setTerm(input.trim()), 350);
    return () => window.clearTimeout(timeout);
  }, [input]);
  useEffect(() => { setOpen(false); setActive(-1); }, [location.pathname, location.search]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); inputRef.current?.focus(); setOpen(true);
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
  const choose = (href: string) => { setOpen(false); setActive(-1); navigate(href); };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setActive(-1); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!open) setOpen(true);
      if (!items.length) return;
      event.preventDefault();
      setActive(index => event.key === 'ArrowDown' ? (index + 1) % items.length : (index + items.length - 1) % items.length);
    }
    if (event.key === 'Enter' && active >= 0 && items[active]) { event.preventDefault(); choose(items[active].href); }
  };
  return <div className="search-command" ref={root}>
    <form role="search" onSubmit={event => { event.preventDefault(); if (input.trim()) choose(searchHref(input.trim())); }}>
      <Search size={18} aria-hidden="true"/>
      <input ref={inputRef} type="search" role="combobox" aria-label="Tìm sách, tác giả và thể loại"
        aria-autocomplete="list" aria-controls="global-search-results" aria-expanded={open && input.trim().length >= 2}
        aria-activedescendant={active >= 0 ? `global-search-option-${active}` : undefined}
        placeholder="Tìm sách, tác giả, thể loại…" value={input} maxLength={150}
        onChange={event => { setInput(event.target.value); setActive(-1); setOpen(true); }}
        onFocus={() => setOpen(true)} onKeyDown={keyDown}/>
      <kbd>Ctrl K</kbd>
    </form>
    {open && input.trim().length >= 2 && <div className="search-command-popover" id="global-search-results" role="listbox" aria-label="Gợi ý tìm kiếm">
      {term !== input.trim() || suggestions.isPending ? <p role="status">Đang tìm trong danh mục…</p>
        : suggestions.isError ? <p role="alert">Chưa tải được gợi ý. Nhấn Enter để xem trang kết quả.</p>
          : items.length ? items.map((item, index) => <Link key={`${item.kind}-${item.id}`} id={`global-search-option-${index}`}
            className={`search-command-item ${active === index ? 'is-active' : ''}`} to={item.href} role="option"
            aria-selected={active === index} onMouseEnter={() => setActive(index)} onClick={() => { setOpen(false); setActive(-1); }}>
            <span className="search-command-image">{item.cover ? <img src={item.cover} alt="" loading="lazy" referrerPolicy="no-referrer"/>
              : item.kind === 'book' ? <BookOpen size={20}/> : item.kind === 'author' ? <UserRound size={20}/> : <Layers3 size={20}/>}</span>
            <span><strong>{markMatch(item.title, term)}</strong><small>{item.detail}</small></span><em>{item.kind === 'book' ? 'Sách' : item.kind === 'author' ? 'Tác giả' : 'Thể loại'}</em>
          </Link>) : <p>Không tìm thấy gợi ý phù hợp.</p>}
      <Link className="search-command-all" to={searchHref(input.trim())} onClick={() => setOpen(false)}>Xem tất cả kết quả “{input.trim()}” →</Link>
    </div>}
  </div>;
}
