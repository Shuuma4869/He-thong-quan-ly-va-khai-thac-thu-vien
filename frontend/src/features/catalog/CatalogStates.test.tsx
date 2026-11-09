import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Pagination } from './CatalogStates';

it('cho trở về đầu khi đường dẫn trỏ trang vượt quá số kết quả còn lại', () => {
  const change = vi.fn();
  render(<Pagination page={{ number: 200, size: 20, totalElements: 3, totalPages: 1 }} onChange={change}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Về trang đầu' }));
  expect(change).toHaveBeenCalledWith(0);
  expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
});
