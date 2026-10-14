import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const core = process.env.LAMS_E2E_CORE_URL;
const container = process.env.LAMS_E2E_CONTAINER;
const owner = process.env.LAMS_E2E_OWNER;
if (!core || !container || !owner) throw new Error('Chạy qua scripts/test-phase1-e2e.ps1 với database kiểm thử riêng.');
const actualOwner = execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "lams.phase1-e2e" }}', container], { encoding: 'utf8' }).trim();
if (actualOwner !== owner) throw new Error('Container không thuộc lượt kiểm thử này.');

const password = 'Phase1-test-' + randomUUID();
const suffix = randomUUID().slice(0, 8);
const accounts: Record<string, { email: string; name: string }> = {};

test.beforeAll(async ({ request }) => {
  for (const role of ['READER', 'LIBRARIAN', 'ADMIN']) {
    const email = `phase1-${role.toLowerCase()}-${suffix}@example.test`;
    const name = `Kiểm thử ${role} ${suffix}`;
    const response = await request.post(`${core}/auth/register`, { data: { fullName: name, email, password } });
    expect(response.status()).toBe(201);
    const body = await response.json();
    const id = String(body.user.id);
    if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('UUID fixture không hợp lệ.');
    if (role !== 'READER') execFileSync('docker', ['exec', container!, 'psql', '-U', 'lams', '-d', 'lams_core', '-v', 'ON_ERROR_STOP=1',
      '-c', `INSERT INTO user_roles(user_id, role_code) VALUES ('${id}', '${role}')`], { stdio: 'pipe' });
    accounts[role] = { email, name };
  }
});

test('Reader đăng ký, đọc profile, bị chặn staff và đăng xuất', async ({ page }) => {
  const address = `reader-browser-${suffix}@example.test`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dang-ky');
  await page.getByLabel('Họ và tên', { exact: true }).fill('Người đọc kiểm thử');
  await page.getByLabel('Email', { exact: true }).fill(address);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await page.getByRole('link', { name: 'Hồ sơ của tôi' }).click();
  await expect(page.getByText(address, { exact: true })).toBeVisible();
  await expect(page.getByText(/Chưa có thông tin hồ sơ bổ sung/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(address, { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/profile-mobile.png', fullPage: true });
  await page.goto('/nhan-vien/thanh-vien');
  await expect(page.getByRole('heading', { name: /403/ })).toBeVisible();
  await page.goto('/ho-so');
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true }).first()).toBeVisible();
  await page.goto('/ho-so');
  await expect(page.getByLabel('Email hoặc mã thành viên')).toBeVisible();
});

for (const role of ['LIBRARIAN', 'ADMIN']) {
  test(`${role} tìm/lọc/sắp xếp/phân trang và reload URL`, async ({ page }) => {
    await page.setViewportSize(role === 'ADMIN' ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await page.goto('/dang-nhap');
    await page.getByLabel('Email hoặc mã thành viên').fill(accounts[role].email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await page.getByRole('link', { name: 'Thành viên', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByLabel('Tìm theo mã hoặc họ tên').fill(suffix);
    await expect(page.getByRole('status')).toContainText('Tổng cộng 3 thành viên');
    await expect(page.getByLabel('Tìm theo mã hoặc họ tên')).toBeFocused();
    await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).selectOption('LOCKED');
    await expect(page.getByText('Không có thành viên phù hợp', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
    await page.getByRole('combobox', { name: 'Sắp xếp', exact: true }).selectOption('fullName,desc');
    await page.goto('/nhan-vien/thanh-vien?query=' + suffix + '&size=1&page=0&sort=fullName,desc');
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Trang sau' }).click();
    await expect(page).toHaveURL(/page=1/);
    await page.reload();
    await expect(page.getByText('Trang 2 / 3', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText('Trang 1 / 3', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/members-${role.toLowerCase()}.png`, fullPage: true });
    await page.getByRole('link', { name: 'Hồ sơ của tôi', exact: true }).filter({ visible: true }).click();
    await expect(page.getByText(accounts[role].email, { exact: true })).toBeVisible();
  });
}
