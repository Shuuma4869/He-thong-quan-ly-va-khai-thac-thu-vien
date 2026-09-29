import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthHero } from '../../features/auth/AuthHero';
import { BrandLogo } from './BrandLogo';
import { BRAND_NAME, BRAND_SUBTITLE } from './brand';

describe('nhận diện LAMS', () => {
  it('compact và full có cùng accessible name, subtitle chỉ hiển thị ở full', () => {
    render(<><BrandLogo /><BrandLogo variant="full" tone="light" /></>);
    const logos = screen.getAllByRole('img', { name: `${BRAND_NAME} · ${BRAND_SUBTITLE}` });
    expect(logos).toHaveLength(2);
    expect(within(logos[0]).queryByText(BRAND_SUBTITLE)).not.toBeInTheDocument();
    expect(within(logos[1]).getByText(BRAND_SUBTITLE)).toBeInTheDocument();
  });

  it('hero xác thực tham chiếu ảnh thư viện local', () => {
    const { container } = render(<MemoryRouter><AuthHero /></MemoryRouter>);
    expect(container.querySelector('.login-brand')?.getAttribute('style')).toContain('auth-cover-library.jpg');
    expect(screen.getByRole('heading', { name: /Tìm sách nhanh hơn/ })).toBeInTheDocument();
  });
});
