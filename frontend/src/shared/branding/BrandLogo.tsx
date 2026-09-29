import logoMark from '../../assets/img/branding/logo-mark.svg';
import { BRAND_NAME, BRAND_SUBTITLE } from './brand';

type BrandLogoProps = {
  variant?: 'compact' | 'full';
  tone?: 'dark' | 'light';
  className?: string;
};

export function BrandLogo({ variant = 'compact', tone = 'dark', className = '' }: BrandLogoProps) {
  return <span className={`brand-logo brand-logo--${variant} brand-logo--${tone} ${className}`.trim()}
    role="img" aria-label={`${BRAND_NAME} · ${BRAND_SUBTITLE}`}>
    <img className="brand-logo__mark" src={logoMark} alt="" aria-hidden="true" />
    <span className="brand-logo__words" aria-hidden="true">
      <strong>{BRAND_NAME}</strong>
      {variant === 'full' && <span>{BRAND_SUBTITLE}</span>}
    </span>
  </span>;
}
