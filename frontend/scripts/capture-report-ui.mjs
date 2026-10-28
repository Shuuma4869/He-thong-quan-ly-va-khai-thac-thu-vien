import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.cwd(), '..');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const out = resolve(root, 'ho-so-nop-bai', 'minh-chung-giao-dien', sha.slice(0, 7));
mkdirSync(out, { recursive: true });
const base = 'http://localhost:5173';
const api = 'http://localhost:8080/api/v1/public/catalog';
const fetchJson = async (path) => {
  const response = await fetch(`${api}${path}`);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
};
const books = await fetchJson('/books?query=Pride%20and%20Prejudice&size=20');
const fallbackBooks = await fetchJson('/books?query=A%20Tale%20of%20Two%20Cities&size=20');
const authors = await fetchJson('/authors?size=1');
const categories = await fetchJson('/categories?size=1');
const approvedBook = books.items.find(item => item.title === 'Pride and Prejudice');
const fallbackBook = fallbackBooks.items.find(item => item.title === 'A Tale of Two Cities' && !item.cover);
if (!approvedBook?.cover || !fallbackBook) throw new Error('Thiếu dữ liệu demo bìa đã duyệt hoặc bìa chữ.');
const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--no-sandbox'] });
const captures = [];
const failures = [];
async function visit(page, name, route, width, height = 900, save = true) {
  await page.setViewportSize({ width, height });
  const response = await page.goto(`${base}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.locator('body').waitFor();
  const state = await page.evaluate(() => ({
    title: document.title,
    bodyWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    h1: document.querySelector('h1')?.textContent?.trim() ?? '',
    alerts: [...document.querySelectorAll('[role="alert"]')].map(e => e.textContent?.trim()),
  }));
  if (response?.status() !== 200 || state.bodyWidth > state.viewportWidth + 2) {
    failures.push({ name, route, width, status: response?.status(), ...state });
  }
  if (save) {
    const file = `${name}-${width}.png`;
    await page.screenshot({ path: resolve(out, file), fullPage: true, animations: 'disabled' });
    captures.push({ file, route, width, height, status: response?.status(), h1: state.h1, alerts: state.alerts });
  }
}
async function login(page, email, password) {
  await page.goto(`${base}/dang-nhap`);
  await page.getByLabel('Email hoặc mã thành viên').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  try { await page.waitForURL(url => !url.pathname.endsWith('/dang-nhap'), { timeout: 20000 }); }
  catch (error) {
    console.error('Không đăng nhập được:', email, await page.locator('[role="alert"]').allTextContents());
    throw error;
  }
}
try {
  const guest = await browser.newPage();
  const publicRoutes = [
    ['landing', '/'], ['catalog', '/sach'], ['authors', '/tac-gia'], ['categories', '/the-loai'],
    ['author-detail', `/tac-gia/${authors.items[0].id}`], ['category-detail', `/the-loai/${categories.items[0].id}`],
    ['book-approved', `/sach/${approvedBook.id}`], ['book-fallback', `/sach/${fallbackBook.id}`],
    ['login', '/dang-nhap'], ['register', '/dang-ky'], ['appearance-guest', '/cai-dat/giao-dien'],
  ];
  for (const [name, route] of publicRoutes) {
    for (const width of [390, 768, 1024, 1366, 1440, 1536, 1920]) {
      await visit(guest, name, route, width, 900, width === 390 || width === 1440);
    }
  }
  for (const [name, route, width] of [
    ['book-approved-viewport', `/sach/${approvedBook.id}`, 1440],
    ['book-fallback-viewport', `/sach/${fallbackBook.id}`, 390],
  ]) {
    await guest.setViewportSize({ width, height: 900 });
    const response = await guest.goto(`${base}${route}`, { waitUntil: 'networkidle' });
    if (response?.status() !== 200) throw new Error(`${name}: HTTP ${response?.status()}`);
    const file = `${name}-${width}.png`;
    await guest.screenshot({ path: resolve(out, file), animations: 'disabled' });
    captures.push({ file, route, width, height: 900, status: response.status(), kind: 'viewport' });
  }
  await guest.close();
  for (const [role, email, password, routes] of [
    ['reader', 'reader.demo@lams.test', process.env.LAMS_DEMO_READER_PASSWORD, [
      ['my-library', '/thu-vien-cua-toi'], ['loans-holds', '/muon-va-giu-cho'],
      ['notifications', '/thong-bao'], ['profile', '/ho-so'], ['appearance-reader', '/cai-dat/giao-dien'],
    ]],
    ['staff', 'librarian.demo@lams.test', process.env.LAMS_DEMO_STAFF_PASSWORD, [
      ['staff-dashboard', '/nhan-vien/bang-dieu-khien'], ['members', '/nhan-vien/thanh-vien'],
      ['staff-catalog', '/nhan-vien/danh-muc'], ['staff-circulation', '/nhan-vien/luu-thong'],
      ['circulation-report', '/nhan-vien/bao-cao-luu-thong'], ['inventory-sessions', '/nhan-vien/kiem-ke'],
      ['acquisition', '/nhan-vien/de-xuat-bo-sung'],
    ]],
    ['admin', 'admin.demo@lams.test', process.env.LAMS_DEMO_ADMIN_PASSWORD, [
      ['admin-accounts', '/nhan-vien/tai-khoan'], ['review-moderation', '/nhan-vien/bao-cao-danh-gia'],
    ]],
  ]) {
    if (!password) { failures.push({ role, error: 'Không có mật khẩu demo trong môi trường chụp.' }); continue; }
    const page = await browser.newPage();
    await login(page, email, password);
    for (const [name, route] of routes) {
      for (const width of [390, 768, 1024, 1366, 1440, 1536, 1920]) {
        await visit(page, name, route, width, 900, width === 390 || width === 1440);
      }
    }
    await page.close();
  }
} finally { await browser.close(); }
writeFileSync(resolve(out, 'manifest.json'), JSON.stringify({ sha, capturedAt: new Date().toISOString(), environment: 'Windows 11; Chrome headless; local Core 8080, Insight 3000, Vite 5173; PostgreSQL demo', approvedBookId: approvedBook.id, fallbackBookId: fallbackBook.id, captures, failures }, null, 2));
console.log(JSON.stringify({ sha, images: captures.length, failures: failures.length, out }));
if (failures.length) process.exitCode = 1;
