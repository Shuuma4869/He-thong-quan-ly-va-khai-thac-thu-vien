import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReaderHomePage } from './ReaderHomePage';

describe('ReaderHomePage', () => {
  it('hiển thị empty state thay vì dữ liệu sách giả', () => {
    render(<MemoryRouter><ReaderHomePage /></MemoryRouter>);
    expect(screen.getByText('Chưa có dữ liệu sách.')).toBeInTheDocument();
  });
});
