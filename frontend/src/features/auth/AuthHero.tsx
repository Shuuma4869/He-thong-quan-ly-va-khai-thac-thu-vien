import type { CSSProperties } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import authCover from '../../assets/img/auth/auth-cover-library.jpg';
import { BrandLogo } from '../../shared/branding/BrandLogo';

export function AuthHero() {
  const imageStyle = { '--auth-cover-image': `url("${authCover}")` } as CSSProperties;
  return <section className="login-brand" aria-labelledby="auth-hero-title" style={imageStyle}>
    <div className="login-brand-content">
      <Link className="auth-home-link" to="/"><ArrowLeft size={16} /> Về trang chủ</Link>
      <div className="auth-hero-copy">
        <BrandLogo variant="full" tone="light" />
        <h1 id="auth-hero-title" className="editorial-title">Tìm sách nhanh hơn.<br />Quản lý thư viện gọn hơn.</h1>
        <p>Tra cứu sách, theo dõi lượt mượn và xử lý các nghiệp vụ thư viện trong một hệ thống thống nhất.</p>
      </div>
    </div>
  </section>;
}
