import { fireEvent, render, screen } from '@testing-library/react';
import { BookCover } from './BookCover';

const cover = {
  editionId: '11111111-1111-4111-8111-111111111111',
  imageUrl: 'https://covers.openlibrary.org/b/id/123-M.jpg',
  source: 'open-library' as const,
  sourceUrl: 'https://openlibrary.org/books/OL1M',
  license: 'Dùng theo giấy phép đã được kiểm',
  licenseUrl: 'https://openlibrary.org/books/OL1M',
  attribution: 'Nguồn ảnh thư viện',
  approvedAt: '2026-10-25T00:00:00Z',
};

it('hiện bìa được duyệt và ghi công, rồi trở lại bìa chữ khi ảnh lỗi', () => {
  render(<BookCover title="Sách thật" cover={cover} />);
  const image = screen.getByRole('img', { name: 'Bìa sách Sách thật' });
  expect(image).toHaveAttribute('src', cover.imageUrl);
  expect(image).toHaveAttribute('loading', 'lazy');
  expect(screen.getByText(cover.attribution)).toBeInTheDocument();
  fireEvent.error(image);
  expect(screen.getByLabelText('Chưa có bìa đã xác minh')).toHaveTextContent('Bìa đang cập nhật');
});

it('không hiển thị URL ảnh ngoài danh sách nguồn cho phép', () => {
  render(<BookCover title="Sách thật" cover={{ ...cover, imageUrl: 'https://evil.example/cover.jpg' }} />);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Chưa có bìa đã xác minh')).toBeInTheDocument();
});

it('thử lại khi nhân viên thay ảnh đã duyệt', () => {
  const view = render(<BookCover title="Sách thật" cover={cover} />);
  fireEvent.error(screen.getByRole('img', { name: 'Bìa sách Sách thật' }));
  view.rerender(<BookCover title="Sách thật" cover={{ ...cover, imageUrl: 'https://covers.openlibrary.org/b/id/456-M.jpg' }} />);
  expect(screen.getByRole('img', { name: 'Bìa sách Sách thật' })).toHaveAttribute('src', 'https://covers.openlibrary.org/b/id/456-M.jpg');
});
