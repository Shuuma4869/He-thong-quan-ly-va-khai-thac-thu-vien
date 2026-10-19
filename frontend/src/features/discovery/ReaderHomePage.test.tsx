import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReaderHomePage } from './ReaderHomePage';

describe('ReaderHomePage', () => {
  it('dẫn tới Catalog mà không khẳng định kho sách rỗng khi chưa truy vấn', () => {
    render(<MemoryRouter><ReaderHomePage /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Khám phá danh mục' })).toHaveAttribute('href', '/sach');
    expect(screen.queryByText('Chưa có dữ liệu sách.')).not.toBeInTheDocument();
  });
});
