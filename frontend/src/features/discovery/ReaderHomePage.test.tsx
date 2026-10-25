import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { vi } from 'vitest';
import { ReaderHomePage } from './ReaderHomePage';

vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ isPending: true }) }));
vi.mock('../auth/auth-context', () => ({ useAuth: () => ({ user: null }) }));

describe('ReaderHomePage', () => {
  it('tìm sách thật qua URL Catalog và chưa nhận là kho rỗng khi chưa có phản hồi', () => {
    function Destination() { const location = useLocation(); return <p>{location.search}</p>; }
    render(<MemoryRouter><Routes><Route path="/" element={<ReaderHomePage />} />
      <Route path="/sach" element={<Destination />} /></Routes></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Khám phá danh mục' })).toHaveAttribute('href', '/sach');
    expect(screen.queryByText('Chưa có dữ liệu sách.')).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Bạn muốn đọc gì?'), { target: { value: 'Lịch sử' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tìm sách' }));
    expect(screen.getByText('?query=L%E1%BB%8Bch+s%E1%BB%AD')).toBeInTheDocument();
  });
});
