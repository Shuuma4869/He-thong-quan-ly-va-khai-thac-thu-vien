export function sidebarItemActive(pathname: string, hash: string, to: string) {
  const [path, section] = to.split('#');
  if (pathname !== path && !(path !== '/' && pathname.startsWith(`${path}/`))) return false;
  if (path === '/thu-vien-cua-toi') return section ? hash === `#${section}` : !hash;
  return true;
}
