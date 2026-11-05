import { destinationFor, type CurrentUser } from './auth-context';

// Chỉ nhận đường dẫn nội bộ; không chuyển tiếp URL bên ngoài hoặc quay lại form xác thực.
export function returnPath(search: string): string | null {
  const value = new URLSearchParams(search).get('returnTo');
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\s]/.test(value)
    || [...value].some(character => character.codePointAt(0)! < 32)) return null;
  const path = value.split(/[?#]/)[0];
  if (path === '/dang-nhap' || path === '/dang-ky') return null;
  return value;
}

export function authLink(path: '/dang-nhap' | '/dang-ky', destination: string | null) {
  return destination ? `${path}?${new URLSearchParams({ returnTo: destination })}` : path;
}

export function afterAuthentication(user: CurrentUser, search: string) {
  return returnPath(search) ?? destinationFor(user);
}
