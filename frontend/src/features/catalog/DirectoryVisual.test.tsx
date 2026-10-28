import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { DirectoryVisual } from './DirectoryVisual';
import type { DirectoryImage } from './directory-image-api';

const image = (imageUrl: string): DirectoryImage => ({
  subjectId: '22222222-2222-4222-8222-222222222222', imageUrl,
  source: 'wikimedia', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Writer.jpg',
  license: 'CC BY-SA', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  attribution: 'Tác giả ảnh', approvedAt: '2026-10-28T00:00:00Z', context: 'portrait',
});

it('ảnh mới được thử tải khi ảnh đã duyệt trước đó bị lỗi', () => {
  const first = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Writer.jpg';
  const second = 'https://upload.wikimedia.org/wikipedia/commons/c/cd/Another.jpg';
  const view = render(<DirectoryVisual kind="authors" title="Tác giả A" image={image(first)} />);
  fireEvent.error(screen.getByRole('img', { name: 'Chân dung tác giả Tác giả A' }));
  expect(screen.getByLabelText('Chưa có chân dung đã duyệt')).toBeInTheDocument();
  view.rerender(<DirectoryVisual kind="authors" title="Tác giả B" image={image(second)} />);
  expect(screen.getByRole('img', { name: 'Chân dung tác giả Tác giả B' })).toHaveAttribute('src', second);
});
