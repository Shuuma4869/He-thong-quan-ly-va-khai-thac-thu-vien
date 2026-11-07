import { test as base, expect, chromium, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { BarcodeFormat, QRCodeWriter } from '@zxing/library';

const desktopEndpoint = process.env.LAMS_E2E_DESKTOP_CDP;
const test = base.extend({
  page: async ({ page }, providePage) => {
    if (!desktopEndpoint) { await providePage(page); return; }
    const desktop = await chromium.connectOverCDP(desktopEndpoint);
    try {
      const context = desktop.contexts()[0];
      await context.clearCookies();
      // WebView2 thêm downloads-hub sau khi tải file; thứ tự targets không xác định.
      const nativePages = [];
      for (const target of context.pages()) {
        if (new URL(target.url()).origin === 'http://tauri.localhost'
          && await target.evaluate(() => '__TAURI_INTERNALS__' in window).catch(() => false)) nativePages.push(target);
      }
      if (nativePages.length !== 1) throw new Error(`Cần đúng một cửa sổ LAMS, nhận ${nativePages.length}.`);
      const nativePage = nativePages[0];
      await nativePage.goto('http://tauri.localhost/');
      expect(await nativePage.evaluate(() => '__TAURI_INTERNALS__' in window)).toBe(true);
      await nativePage.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
      await nativePage.reload();
      await providePage(nativePage);
    } finally { await desktop.close(); }
  },
});
async function navigate(page: Page, path: string) {
  await page.goto(desktopEndpoint ? `http://tauri.localhost/#${path}` : path);
}

async function captureFullPage(page: Page, options: Parameters<Page['screenshot']>[0]) {
  // Hủy cuộn mượt còn chạy trước khi chụp ở đầu trang, kể cả trên WebView2.
  await expect.poll(() => page.evaluate(async () => {
    // Resize và font/ảnh tải xong có thể dịch điểm neo sau lần scroll đầu tiên.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return window.scrollY;
  })).toBeLessThan(1);
  await page.screenshot({ ...options, animations: 'disabled' });
}

const core = process.env.LAMS_E2E_CORE_URL;
const insight = process.env.LAMS_E2E_INSIGHT_URL;
const container = process.env.LAMS_E2E_CONTAINER;
const owner = process.env.LAMS_E2E_OWNER;
if (!core || !insight || !container || !owner) throw new Error('Chạy qua scripts/test-phase1-e2e.ps1 với database kiểm thử riêng.');
const actualOwner = execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "lams.phase1-e2e" }}', container], { encoding: 'utf8' }).trim();
if (actualOwner !== owner) throw new Error('Container không thuộc lượt kiểm thử này.');

const password = 'Phase1-test-' + randomUUID();
const suffix = randomUUID().slice(0, 8);
const accounts: Record<string, { email: string; name: string }> = {};
const evidenceViewports = [
  { width: 390, height: 844 }, { width: 768, height: 1024 },
  { width: 1024, height: 900 }, { width: 1366, height: 900 },
  { width: 1440, height: 900 }, { width: 1920, height: 1080 },
];

test('Nghiệm thu thư viện mới: chưa có danh mục và nghiệp vụ', async ({ page, request }) => {
  const catalog = await request.get(`${core}/public/catalog/books?size=1`);
  expect(catalog.status()).toBe(200);
  expect((await catalog.json()).page.totalElements).toBe(0);
  await navigate(page, '/sach');
  await expect(page.getByRole('heading', { name: 'Chưa có sách phù hợp' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await loginCatalog(page, 'LIBRARIAN');
  await navigate(page, '/nhan-vien/danh-muc');
  await expect(page.getByRole('button', { name: 'Thêm tác phẩm', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await captureFullPage(page, { path: 'test-results/new-library-staff.png', fullPage: true });
});

test('Nghiệm thu mạng: lỗi Core và Insight không biến thành danh sách rỗng', async ({ page }) => {
  await loginCatalog(page, 'READER');
  await page.route('**/public/catalog/books?*', route => route.abort('failed'));
  await navigate(page, '/sach');
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Đang tải dữ liệu' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Không tải được dữ liệu' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Chưa có sách phù hợp' })).toHaveCount(0);
  await page.unroute('**/public/catalog/books?*');
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Không tải được dữ liệu' })).toHaveCount(0);
  await page.route('**/me/notifications*', route => route.abort('failed'));
  await navigate(page, '/thong-bao');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(page.getByText('Bạn chưa có thông báo ở trang này.')).toHaveCount(0);
  await page.unroute('**/me/notifications*');
  await page.getByRole('button', { name: 'Tải lại dữ liệu', exact: true }).last().click();
  await expect(page.getByText('Bạn chưa có thông báo ở trang này.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('0 thông báo chưa đọc')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('Báo cáo giữ chỗ: sự kiện thật, lọc tác phẩm, CSV và quyền Reader', async ({ page, request }) => {
  test.setTimeout(120000);
  const headers = await staffApi(request);
  const book = await createCatalog(request, headers, '/books', { title: `Báo cáo giữ chỗ ${suffix}`, authorIds: [], categoryIds: [] });
  const edition = await createCatalog(request, headers, `/books/${book.id}/editions`, {});
  const branch = await createCatalog(request, headers, '/branches', { code: `RP-${suffix}`, name: `Chi nhánh báo cáo ${suffix}` });
  const shelf = await createCatalog(request, headers, '/shelves', { branchId: branch.id, code: 'R1', label: 'Kệ báo cáo', sortOrder: 0 });
  const copy = await createCatalog(request, headers, '/copies', { editionId: edition.id, shelfId: shelf.id, barcode: `RP-${suffix}` });
  expect((await request.post(`${core}/copies/${copy.id}/state`, { headers,
    data: { requestId: randomUUID(), version: copy.version, status: 'AVAILABLE', reason: 'Chuẩn bị dữ liệu kiểm thử báo cáo' } })).status()).toBe(200);
  const login = await request.post(`${core}/auth/register`, { data: {
    fullName: 'Người đọc kiểm thử báo cáo', email: `hold-report-${suffix}@example.test`, password } });
  expect(login.status()).toBe(201);
  const readerHeaders = { Authorization: `Bearer ${(await login.json()).accessToken}` };
  const holdResponse = await request.post(`${core}/holds`, { headers: readerHeaders,
    data: { requestId: randomUUID(), bookId: book.id, editionId: edition.id, branchId: branch.id, anyEdition: false } });
  expect(holdResponse.status(), await holdResponse.text()).toBe(201);
  const from = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const to = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams({ from: `${from}T00:00:00+07:00`, to: `${to}T00:00:00+07:00`, bookId: book.id });
  const report = await request.get(`${core}/reports/hold-activity?${params}`, { headers });
  expect(report.status()).toBe(200);
  const evidence = await report.json();
  expect(evidence.totalEvents).toBeGreaterThanOrEqual(1);
  expect((await request.get(`${core}/reports/hold-activity?${params}`, { headers: readerHeaders })).status()).toBe(403);
  await loginCatalog(page, 'LIBRARIAN');
  await navigate(page, '/nhan-vien/bao-cao-giu-cho');
  await page.getByLabel('Từ ngày (bao gồm)').fill(from);
  await page.getByLabel('Đến ngày (không bao gồm)').fill(to);
  await page.getByRole('button', { name: 'Chọn tác phẩm', exact: true }).click();
  await page.getByRole('combobox', { name: 'Tìm trong tác phẩm' }).fill(book.title);
  await page.getByRole('radio', { name: book.title, exact: true }).click();
  await expect(page.getByRole('group', { name: 'Tác phẩm', exact: true })).toContainText(book.title);
  await page.getByRole('button', { name: 'Xem hoạt động giữ chỗ', exact: true }).click();
  await expect(page.getByRole('heading', { name: `${evidence.totalEvents} sự kiện`, exact: true })).toBeVisible();
  await expect(page.getByRole('table')).toContainText(branch.name);
  await expect(page.getByRole('table')).toContainText('Tạo yêu cầu');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất CSV theo bộ lọc' }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const csv = Buffer.concat(chunks).toString('utf8');
  expect(csv).toContain(book.id); expect(csv).toContain('HOLD_CREATED');
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/hold-activity-${viewport.width}.png`, fullPage: true });
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(results.violations).toEqual([]);
  }
});

test('Tìm kiếm mobile: dialog, bàn phím, focus và 11 cỡ màn hình', async ({ page, request }) => {
  test.setTimeout(120000);
  const headers = await staffApi(request);
  const book = await createCatalog(request, headers, '/books', { title: `Tìm nhanh ${suffix}`, authorIds: [], categoryIds: [] });
  await navigate(page, '/sach');
  for (const width of [320, 360, 390, 428, 768, 1024, 1280, 1366, 1440, 1536, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width <= 428) {
      const trigger = page.getByRole('button', { name: 'Mở tìm kiếm' });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Tìm trong thư viện' });
      await expect(dialog).toBeVisible();
      const search = dialog.getByRole('combobox');
      await expect(search).toBeFocused();
      await search.fill(book.title);
      await expect(dialog.getByRole('option').filter({ hasText: book.title })).toBeVisible();
      for (let step = 0; step < 6; step++) {
        await page.keyboard.press('Tab');
        expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
      }
      await search.focus();
      await search.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
      const menu = page.getByRole('button', { name: 'Mở menu thư viện' });
      await menu.click();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    }
  }
});

test('Giao diện: bản xem thử giữ khi chuyển trang, lưu và đọc lại đúng revision', async ({ page }) => {
  test.setTimeout(60000);
  await loginCatalog(page, 'READER');
  await navigate(page, '/cai-dat/giao-dien');
  await page.getByRole('button', { name: 'Lục bảo', exact: true }).click();
  await expect(page.getByText(/Có thay đổi chưa lưu/)).toBeVisible();
  await page.locator('.library-sidebar-desktop').getByRole('link', { name: 'Khám phá sách', exact: true }).click();
  await page.getByRole('link', { name: 'Cài đặt giao diện', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Lục bảo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Lưu giao diện', exact: true }).click();
  await expect(page.getByText('Đã lưu thiết lập giao diện.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Lục bảo', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Khôi phục mặc định' }).click();
  await expect(page.getByRole('button', { name: 'Xanh dương', exact: true })).toHaveAttribute('aria-pressed', 'true');
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      const audit = await new AxeBuilder({ page }).include('.appearance-page')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations).toEqual([]);
    }
    await captureFullPage(page, { path: `test-results/appearance-${viewport.width}.png`, fullPage: true });
  }
});

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

test('Phase 2.5 lịch sử ISBN lưu thật, reload và xóa theo owner', async ({page,request})=>{
  test.setTimeout(60000);
  const insight=process.env.LAMS_E2E_INSIGHT_URL!;
  const historyEmail=`history-${randomUUID()}@example.test`;
  const created=await request.post(`${core}/auth/register`,{data:{fullName:'Thủ thư kiểm thử lịch sử',email:historyEmail,password}});
  expect(created.status()).toBe(201);
  const historyId=String((await created.json()).user.id);
  if(!/^[a-f0-9-]{36}$/i.test(historyId)) throw new Error('UUID fixture không hợp lệ');
  execFileSync('docker',['exec',container!,'psql','-U','lams','-d','lams_core','-v','ON_ERROR_STOP=1','-c',`INSERT INTO user_roles(user_id,role_code) VALUES ('${historyId}','LIBRARIAN')`],{stdio:'pipe'});
  const login=async(role:string)=>{
    const response=await request.post(`${core}/auth/login`,{data:{identifier:role==='HISTORY'?historyEmail:accounts[role].email,password,remember:false}});
    expect(response.status()).toBe(200); return (await response.json()).accessToken as string;
  };
  const reader=await login('READER');
  expect((await request.get(`${insight}/metadata/history`,{headers:{Authorization:`Bearer ${reader}`}})).status()).toBe(403);
  await navigate(page,'/dang-nhap');
  await page.getByLabel('Email hoặc mã thành viên').fill(historyEmail);
  await page.getByLabel('Mật khẩu',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await expect(page.getByRole('button',{name:'Đăng xuất'})).toBeVisible();
  await navigate(page,'/nhan-vien/danh-muc');
  await page.getByRole('button',{name:'Lịch sử tra cứu ISBN',exact:true}).click();
  await page.getByLabel('ISBN-13 cần tra và lưu').fill('9780132350884');
  await page.getByRole('button',{name:'Tra cứu và lưu lịch sử'}).click();
  await expect(page.getByText(/Đã lưu lịch sử tra cứu/)).toBeVisible({timeout:30000});
  await page.reload();
  await page.getByRole('button',{name:'Lịch sử tra cứu ISBN',exact:true}).click();
  await expect(page.getByRole('button',{name:'Mở lại 9780132350884'})).toBeVisible();
  // Tra lại vẫn gọi provider thật; timeout nguồn 5 giây còn cần thời gian xử lý và trả HTTP.
  const replayResponse=page.waitForResponse(response=>response.request().method()==='POST'
    && /\/metadata\/history\/[a-f0-9-]+\/replay$/.test(new URL(response.url()).pathname),{timeout:30000});
  await page.getByRole('button',{name:'Mở lại 9780132350884'}).click();
  expect((await replayResponse).status()).toBe(200);
  await expect(page.getByText(/Kết quả tra lại nguồn hiện tại/)).toBeVisible();
  for (const viewport of [{width:1440,height:900},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.getByLabel('ISBN-13 cần tra và lưu').focus();
    await page.keyboard.press('Tab');
    // ISBN rỗng sau reload: submit disabled, Tab chuyển tới bộ lọc.
    await expect(page.getByLabel('Lọc lịch sử theo đầu ISBN')).toBeFocused();
    await captureFullPage(page, {path:`test-results/history-${viewport.width}.png`,fullPage:true});
  }
  const staff=await login('HISTORY');
  const list=await request.get(`${insight}/metadata/history`,{headers:{Authorization:`Bearer ${staff}`}});
  expect(list.status()).toBe(200);
  const record=(await list.json()).items[0];
  expect(record).not.toHaveProperty('ownerId');
  const admin=await login('ADMIN');
  for(const method of ['get','delete'] as const) {
    const response=await request[method](`${insight}/metadata/history/${record.id}`,{headers:{Authorization:`Bearer ${admin}`}});
    expect(response.status()).toBe(404);
  }
  await page.getByRole('button',{name:'Xóa 9780132350884',exact:true}).click();
  await page.getByRole('button',{name:'Xác nhận xóa lịch sử'}).click();
  await expect(page.getByText('Đã xóa bản ghi lịch sử.')).toBeVisible();
  await expect(page.getByText('Chưa có bản ghi ở trang này.')).toBeVisible();
});

test('Reader đăng ký, đọc profile, bị chặn staff và đăng xuất', async ({ page }) => {
  const address = `reader-browser-${suffix}@example.test`;
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, '/dang-ky');
  await page.getByLabel('Họ và tên', { exact: true }).fill('Người đọc kiểm thử');
  await page.getByLabel('Email', { exact: true }).fill(address);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu').fill(password);
  await page.getByRole('button', { name: 'Đăng ký', exact: true }).click();
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('navigation', { name: 'Điều hướng di động' }).getByRole('link', { name: 'Hồ sơ của tôi' }).click();
  await expect(page.getByText(address, { exact: true })).toBeVisible();
  await expect(page.getByLabel('Họ và tên')).toHaveValue('Người đọc kiểm thử');
  await page.reload();
  await expect(page.getByText(address, { exact: true })).toBeVisible();
  const refreshCookie = (await page.context().cookies()).find(cookie => cookie.name === 'lams_refresh');
  expect(refreshCookie?.httpOnly).toBe(true);
  expect(refreshCookie?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await captureFullPage(page, { path: 'test-results/profile-mobile.png', fullPage: true });
  await navigate(page, '/nhan-vien/thanh-vien');
  await expect(page.getByRole('heading', { name: /403/ })).toBeVisible();
  await page.getByRole('link', { name: 'Về danh mục sách' }).click();
  await expect(page).toHaveURL(/\/sach$/);
  await expect(page.getByRole('heading', { name: /403/ })).toHaveCount(0);
  await navigate(page, '/ho-so');
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('link', { name: 'Đăng nhập', exact: true }).first()).toBeVisible();
  await navigate(page, '/ho-so');
  await expect(page.getByLabel('Email hoặc mã thành viên')).toBeVisible();
});

for (const role of ['LIBRARIAN', 'ADMIN']) {
  test(`${role} tìm/lọc/sắp xếp/phân trang và reload URL`, async ({ page }) => {
    await page.setViewportSize(role === 'ADMIN' ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    await navigate(page, '/dang-nhap');
    await page.getByLabel('Email hoặc mã thành viên').fill(accounts[role].email);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    if (role === 'ADMIN') await page.getByRole('button', { name: 'Mở menu nhân viên' }).click();
    await page.getByRole('link', { name: 'Thành viên', exact: true }).filter({ visible: true }).click();
    await expect(page.getByRole('table')).toBeVisible();
    await page.getByLabel('Tìm theo mã hoặc họ tên').fill(suffix);
    await expect(page.getByRole('status')).toContainText('Tổng cộng 3 thành viên');
    await expect(page.getByLabel('Tìm theo mã hoặc họ tên')).toBeFocused();
    await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).selectOption('LOCKED');
    await expect(page.getByText('Không có thành viên phù hợp', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Xóa bộ lọc' }).click();
    await page.getByRole('combobox', { name: 'Sắp xếp', exact: true }).selectOption('fullName,desc');
    await navigate(page, '/nhan-vien/thanh-vien?query=' + suffix + '&size=1&page=0&sort=fullName,desc');
    await expect(page.getByRole('table').locator('tbody tr')).toHaveCount(1);
    await page.getByRole('button', { name: 'Trang sau' }).click();
    await expect(page).toHaveURL(/page=1/);
    await page.reload();
    await expect(page.getByText('Trang 2 / 3', { exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText('Trang 1 / 3', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/members-${role.toLowerCase()}.png`, fullPage: true });
    if (role === 'ADMIN') await page.getByRole('button', { name: 'Mở menu nhân viên' }).click();
    await page.getByRole('link', { name: 'Hồ sơ', exact: true }).filter({ visible: true }).click();
    await expect(page.getByText(accounts[role].email, { exact: true })).toBeVisible();
  });
}

async function staffApi(request: import('@playwright/test').APIRequestContext) {
  const response = await request.post(`${core}/auth/login`, { data: { identifier: accounts.LIBRARIAN.email, password, remember: false } });
  expect(response.status()).toBe(200);
  return { Authorization: `Bearer ${(await response.json()).accessToken}` };
}

test('Phase 2 metadata: quyền thật, tra cứu không ghi đè Catalog và ảnh chưa duyệt dùng fallback', async ({page,request})=>{
  test.setTimeout(120_000);
  const insight=process.env.LAMS_E2E_INSIGHT_URL;
  expect(insight,'Script E2E phải khởi động Insight riêng').toBeTruthy();
  const headers=await staffApi(request);
  expect((await request.get(`${insight}/metadata/books/9780140328721`)).status()).toBe(401);
  const readerLogin=await request.post(`${core}/auth/login`,{data:{identifier:accounts.READER.email,password}});
  const readerHeaders={Authorization:`Bearer ${(await readerLogin.json()).accessToken}`};
  expect((await request.get(`${insight}/metadata/books/9780140328721`,{headers:readerHeaders})).status()).toBe(403);
  expect((await request.get(`${insight}/metadata/books/not-isbn`,{headers})).status()).toBe(400);
  expect((await request.get(`${insight}/metadata/books/9780140328722`,{headers})).status()).toBe(400);
  const book=await createCatalog(request,headers,'/books',{title:`A0 Metadata ${suffix}`,authorIds:[],categoryIds:[]});
  const edition=await createCatalog(request,headers,`/books/${book.id}/editions`,{isbn13:'9780140328721'});
  await loginCatalog(page,'LIBRARIAN');await navigate(page,'/nhan-vien/danh-muc');
  await page.getByLabel('Loại dữ liệu').selectOption('editions');await page.getByRole('button',{name:'Chọn tác phẩm',exact:true}).click();
  await page.getByRole('radio',{name:book.title,exact:true}).click();
  await page.getByRole('button',{name:'Ảnh và nguồn'}).click();
  await expect(page.getByText('Chưa có ảnh được duyệt.')).toBeVisible();
  await page.getByRole('button',{name:'Search Books / tra nguồn'}).click();
  await expect(page.getByRole('status')).toContainText(/open-library: (ok|not-found|unavailable|rate-limited|invalid)/,{timeout:20_000});
  console.log('Metadata lookup:',await page.getByRole('status').textContent());
  const stored=await request.get(`${core}/books/${book.id}`,{headers});expect((await stored.json()).title).toBe(book.title);
  const media=await request.get(`${core}/catalog-media/editions/${edition.id}`,{headers});expect(await media.json()).toEqual({media:null});
  const unsafe=await request.post(`${core}/catalog-media/editions/${edition.id}`,{headers,data:{source:'open-library',sourceId:'test',sourceUrl:'https://openlibrary.org/books/OL1M',imageUrl:'https://localhost/private',license:'Test only',licenseUrl:'https://openlibrary.org/books/OL1M',attribution:'Test fixture',evidence:'Test fixture',confirmed:true}});
  expect(unsafe.status()).toBe(422);
  await navigate(page,`/sach/${book.id}`);await expect(page.getByLabel('Chưa có bìa đã xác minh').first()).toBeVisible();
  await page.reload();await expect(page.getByRole('heading',{name:book.title})).toBeVisible();
});
async function createCatalog(request: import('@playwright/test').APIRequestContext, headers: Record<string,string>, path: string, data: unknown) {
  const response = await request.post(`${core}${path}`, { headers, data });
  expect(response.status(), await response.text()).toBe(201); return response.json();
}
async function loginCatalog(page: Page, role: string) {
  await navigate(page, '/dang-nhap');
  await page.getByLabel('Email hoặc mã thành viên').fill(accounts[role].email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).not.toHaveURL(/\/dang-nhap(?:\?|$)/);
  const publicMenu = page.getByRole('button', { name: 'Mở menu' });
  if (role === 'READER' && (page.viewportSize()?.width ?? 1440) <= 850) {
    await expect(publicMenu).toBeVisible();
    await publicMenu.click();
    await expect(page.getByRole('navigation', { name: 'Điều hướng di động' })
      .getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
    await page.keyboard.press('Escape');
  } else {
    await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  }
}

test('Phase 3: yêu thích, review, rating và đổi tài khoản trên dữ liệu thật', async ({ page, request }) => {
  test.setTimeout(120_000);
  const headers = await staffApi(request);
  const book = await createCatalog(request, headers, '/books', { title: `Review ${suffix}`, authorIds: [], categoryIds: [] });
  await loginCatalog(page, 'READER');
  await navigate(page, `/sach/${book.id}`);
  await page.getByRole('button', { name: 'Lưu yêu thích', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bỏ yêu thích' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByLabel('Nội dung đánh giá').fill('Nội dung review đầu tiên');
  await page.getByRole('radio', { name: '1 sao', exact: true }).check();
  await page.getByRole('button', { name: 'Lưu đánh giá', exact: true }).click();
  await expect(page.getByLabel('Điểm trung bình', { exact: true })).toHaveText('1.00/5 · 1 đánh giá');
  await page.reload();
  await expect(page.getByText('Nội dung review đầu tiên', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Bỏ yêu thích' })).toBeVisible();
  await page.getByRole('button', { name: 'Sửa đánh giá của tôi' }).click();
  await page.getByRole('radio', { name: '1 sao', exact: true }).focus();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: '5 sao' })).toBeChecked();
  const patch = page.waitForRequest(req => req.method() === 'PATCH' && req.url().includes('/reviews/'));
  await page.getByRole('button', { name: 'Lưu đánh giá', exact: true }).click();
  expect((await patch).postDataJSON()).toEqual({ rating: 5 });
  await expect(page.getByLabel('Điểm trung bình', { exact: true })).toHaveText('5.00/5 · 1 đánh giá');
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/reviews-${viewport.width}.png`, fullPage: true });
  }
  await navigate(page, `/sach?query=${encodeURIComponent(book.title)}`);
  const reviewCard = page.locator('.book-card').filter({ hasText: book.title });
  await expect(reviewCard.getByLabel('Điểm trung bình 5.00 trên 5 từ 1 đánh giá')).toBeVisible();
  await expect(reviewCard.getByRole('button', { name: `Bỏ yêu thích ${book.title}` })).toHaveAttribute('aria-pressed', 'true');
  await reviewCard.getByRole('button', { name: `Bỏ yêu thích ${book.title}` }).click();
  await expect(reviewCard.getByRole('button', { name: `Lưu yêu thích ${book.title}` })).toHaveAttribute('aria-pressed', 'false');
  await reviewCard.getByRole('button', { name: `Lưu yêu thích ${book.title}` }).click();
  await expect(reviewCard.getByRole('button', { name: `Bỏ yêu thích ${book.title}` })).toHaveAttribute('aria-pressed', 'true');
  await navigate(page, '/thu-vien-cua-toi');
  await expect(page.getByRole('region', { name: 'Sách yêu thích' })
    .getByRole('link', { name: book.title, exact: true })).toBeVisible();
  await expect(page.getByText('Nội dung review đầu tiên', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByText('Nội dung review đầu tiên', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(desktopEndpoint ? /#\/$/ : /\/$/);
  await loginCatalog(page, 'LIBRARIAN');
  await navigate(page, '/thu-vien-cua-toi');
  await expect(page.getByText('Bạn chưa lưu cuốn sách nào. Khám phá danh mục để thêm sách vào thư viện của mình.')).toBeVisible();
  await expect(page.getByText('Bạn chưa có đánh giá ở trang này.')).toBeVisible();
  await navigate(page, `/sach/${book.id}`);
  await expect(page.getByText('Nội dung review đầu tiên', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Nội dung đánh giá')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sửa đánh giá của tôi' })).toHaveCount(0);
  const publicReviews = await request.get(`${core}/books/${book.id}/reviews`, { headers });
  const entry = (await publicReviews.json()).items[0];
  expect(entry.mine).toBe(false); expect(entry).not.toHaveProperty('userId');
  expect((await request.patch(`${core}/books/${book.id}/reviews/${entry.reviewId}`, { headers, data: { rating: 1 } })).status()).toBe(403);
  expect((await request.delete(`${core}/books/${book.id}/reviews/${entry.reviewId}`, { headers })).status()).toBe(403);
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(desktopEndpoint ? /#\/$/ : /\/$/);
  await loginCatalog(page, 'READER');
  await navigate(page, `/sach/${book.id}`);
  await page.getByRole('button', { name: 'Xóa đánh giá của tôi' }).click();
  await page.getByRole('button', { name: 'Giữ đánh giá', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Xóa đánh giá của tôi' })).toBeFocused();
  await page.getByRole('button', { name: 'Xóa đánh giá của tôi' }).click();
  await page.getByRole('button', { name: 'Xác nhận xóa đánh giá', exact: true }).click();
  await expect(page.getByLabel('Điểm trung bình', { exact: true })).toHaveText('Chưa có điểm đánh giá.');
  await page.getByRole('button', { name: 'Bỏ yêu thích' }).click();
  await navigate(page, '/thu-vien-cua-toi');
  await expect(page.getByText('Bạn chưa lưu cuốn sách nào. Khám phá danh mục để thêm sách vào thư viện của mình.')).toBeVisible();
  await expect(page.getByText('Bạn chưa có đánh giá ở trang này.')).toBeVisible();
});

test('Bản nháp báo cáo đánh giá: phân trang và quay lại không tự bỏ nội dung', async ({ page, request }) => {
  const headers = await staffApi(request);
  const book = await createCatalog(request, headers, '/books', { title: `Phân trang đánh giá ${suffix}`, authorIds: [], categoryIds: [] });
  expect(book.id).toMatch(/^[0-9a-f-]{36}$/i);
  // Fixture chỉ nằm trong container đã xác minh owner ở đầu suite; các tài khoản này không có mật khẩu đăng nhập.
  execFileSync('docker', ['exec', container!, 'psql', '-U', 'lams', '-d', 'lams_core', '-v', 'ON_ERROR_STOP=1', '-c',
    `WITH readers AS (INSERT INTO users(id,member_code,email,email_normalized,full_name,password_hash,status,created_at,updated_at)
      SELECT gen_random_uuid(),'P${suffix}' || n,'page-${suffix}-' || n || '@example.test','page-${suffix}-' || n || '@example.test',
      'Bạn đọc kiểm thử','!disabled-test-login','ACTIVE',now(),now() FROM generate_series(1,11) n RETURNING id)
      INSERT INTO reviews(id,user_id,book_id,body,rating) SELECT gen_random_uuid(),id,'${book.id}','Nội dung kiểm thử phân trang',4 FROM readers;`], { stdio: 'pipe' });
  await loginCatalog(page, 'READER');
  await navigate(page, `/sach/${book.id}`);
  const reviews = page.getByRole('region', { name: 'Đánh giá của bạn đọc' });
  await reviews.getByRole('button', { name: 'Báo cáo đánh giá', exact: true }).first().click();
  await reviews.getByRole('textbox', { name: 'Lý do báo cáo', exact: true }).fill('Nội dung cần được kiểm tra lại');
  await reviews.getByRole('button', { name: 'Trang sau', exact: true }).click();
  const confirmation = page.getByRole('dialog', { name: 'Rời trang khi chưa hoàn tất?' });
  await expect(confirmation.getByRole('button', { name: 'Tiếp tục chỉnh sửa' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(reviews.getByRole('textbox', { name: 'Lý do báo cáo', exact: true })).toHaveValue('Nội dung cần được kiểm tra lại');
  await reviews.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Bỏ thay đổi và rời trang' }).click();
  await expect(reviews.getByText('Trang 2 / 2 · 11 kết quả', { exact: true })).toBeVisible();
  await expect(reviews.getByRole('textbox', { name: 'Lý do báo cáo', exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(reviews.getByText('Trang 1 / 2 · 11 kết quả', { exact: true })).toBeVisible();
  expect(execFileSync('docker', ['exec', container!, 'psql', '-U', 'lams', '-d', 'lams_core', '-At', '-c',
    `SELECT count(*) FROM review_reports WHERE review_id IN (SELECT id FROM reviews WHERE book_id='${book.id}');`], { encoding: 'utf8' }).trim()).toBe('0');
  const reportRequests: string[] = [];
  page.on('request', event => {
    if (event.method() === 'POST' && new URL(event.url()).pathname.endsWith('/reports')) reportRequests.push(event.url());
  });
  await reviews.getByRole('button', { name: 'Báo cáo đánh giá', exact: true }).first().click();
  await reviews.getByRole('textbox', { name: 'Lý do báo cáo', exact: true }).fill('Nội dung cần được kiểm tra lại');
  await reviews.getByRole('textbox', { name: 'Lý do báo cáo', exact: true }).evaluate(element => {
    const form = element.closest('form')!;
    form.requestSubmit(); form.requestSubmit();
  });
  await expect(reviews.getByText('Đã gửi báo cáo. Quản trị viên sẽ xem xét.', { exact: true })).toBeVisible();
  expect(reportRequests).toHaveLength(1);
  const reportedId = new URL(reportRequests[0]).pathname.split('/').slice(-2)[0];
  expect(reportedId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(execFileSync('docker', ['exec', container!, 'psql', '-U', 'lams', '-d', 'lams_core', '-At', '-c',
    `SELECT count(*) FROM review_reports WHERE book_id='${book.id}' AND review_id='${reportedId}' AND reason='Nội dung cần được kiểm tra lại';`], { encoding: 'utf8' }).trim()).toBe('1');
  await page.reload();
  await reviews.getByRole('button', { name: 'Báo cáo đánh giá', exact: true }).first().click();
  await reviews.getByRole('textbox', { name: 'Lý do báo cáo', exact: true }).fill('Nội dung cần được kiểm tra lại');
  const conflict = page.waitForResponse(response => response.request().method() === 'POST' && response.url() === reportRequests[0]);
  await reviews.getByRole('button', { name: 'Gửi báo cáo', exact: true }).click();
  expect((await conflict).status()).toBe(409);
  await expect(reviews.getByRole('alert')).toBeVisible();
  await expect(reviews.getByRole('textbox', { name: 'Lý do báo cáo', exact: true })).toHaveValue('Nội dung cần được kiểm tra lại');
  await expect(reviews.getByText('Đã gửi báo cáo. Quản trị viên sẽ xem xét.', { exact: true })).toHaveCount(0);
  expect(reportRequests).toHaveLength(2);
  // Đóng đúng báo cáo của fixture, không để hàng đợi OPEN ảnh hưởng bài kiểm duyệt kế tiếp.
  const reportId = execFileSync('docker', ['exec', container!, 'psql', '-U', 'lams', '-d', 'lams_core', '-At', '-c',
    `SELECT id FROM review_reports WHERE book_id='${book.id}' AND review_id='${reportedId}';`], { encoding: 'utf8' }).trim();
  expect(reportId).toMatch(/^[0-9a-f-]{36}$/i);
  const adminLogin = await request.post(`${core}/auth/login`, { data: { identifier: accounts.ADMIN.email, password, remember: false } });
  expect(adminLogin.status()).toBe(200);
  const resolved = await request.post(`${core}/admin/review-reports/${reportId}/decisions`, {
    headers: { Authorization: `Bearer ${(await adminLogin.json()).accessToken}` },
    data: { action: 'DISMISS', reason: 'Đã kiểm tra xong báo cáo của fixture phân trang.' },
  });
  expect(resolved.status()).toBe(200);
  expect((await resolved.json()).action).toBe('DISMISS');
});

test('Phase 2 Reader: lọc server, nhiều ấn bản, Author, reload và chặn ghi', async ({ page, request }) => {
  const headers=await staffApi(request);
  const author=await createCatalog(request,headers,'/authors',{name:`Author ${suffix}`});
  const category=await createCatalog(request,headers,'/categories',{name:`Category ${suffix}`});
  const book=await createCatalog(request,headers,'/books',{title:`Catalog ${suffix}`,description:'Dữ liệu kiểm thử PostgreSQL thật',authorIds:[author.id],categoryIds:[category.id]});
  await createCatalog(request,headers,`/books/${book.id}/editions`,{isbn13:'9780140328721',publicationYear:1988});
  await createCatalog(request,headers,`/books/${book.id}/editions`,{publicationYear:2024,language:'vi'});
  await createCatalog(request,headers,'/books',{title:`Catalog ${suffix} second`,authorIds:[author.id],categoryIds:[category.id]});
  await page.setViewportSize({width:390,height:844}); await loginCatalog(page,'READER');
  await navigate(page,`/sach?query=${suffix}&authorId=${author.id}&categoryId=${category.id}&sort=title&size=1&page=0`);
  await expect(page.getByRole('link',{name:`Catalog ${suffix}`,exact:true})).toBeVisible();
  await expect(page.getByText('Trang 1 / 2 · 2 kết quả')).toBeVisible();
  await page.getByRole('button',{name:'Trang sau'}).click();await expect(page).toHaveURL(/page=1/);
  await page.reload(); await expect(page.getByRole('link',{name:`Catalog ${suffix} second`,exact:true})).toBeVisible();
  await page.goBack();await expect(page.getByText('Trang 1 / 2 · 2 kết quả')).toBeVisible();
  await page.getByRole('link',{name:`Catalog ${suffix}`,exact:true}).click();
  await expect(page.getByText('ISBN 9780140328721')).toBeVisible();await expect(page.getByText('Ấn bản không có ISBN')).toBeVisible();
  await page.getByRole('link',{name:`Author ${suffix}`,exact:true}).first().click();
  await expect(page.getByRole('heading',{name:`Author ${suffix}`})).toBeVisible();
  await expect(page.getByRole('link',{name:`Catalog ${suffix}`,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await captureFullPage(page, {path:'test-results/catalog-author-mobile.png',fullPage:true});
  const readerLogin=await request.post(`${core}/auth/login`,{data:{identifier:accounts.READER.email,password}});
  const readerToken=(await readerLogin.json()).accessToken;
  const forbidden=await request.post(`${core}/books`,{headers:{Authorization:`Bearer ${readerToken}`},data:{title:'Forbidden',authorIds:[],categoryIds:[]}});
  expect(forbidden.status()).toBe(403);
  await navigate(page,'/nhan-vien/danh-muc');await expect(page.getByRole('heading',{name:/403/})).toBeVisible();
});

test('Phase 2 staff: tạo/sửa/xóa Catalog qua giao diện và giữ dữ liệu sau reload', async ({ page }) => {
  test.setTimeout(120_000);
  await loginCatalog(page,'LIBRARIAN');await navigate(page,'/nhan-vien/danh-muc');
  await page.locator('.library-sidebar-desktop').getByRole('link', { name: 'Quầy lưu thông', exact: true }).click();
  await page.locator('.library-sidebar-desktop').getByRole('link', { name: 'Danh mục', exact: true }).click();
  const select=page.getByLabel('Loại dữ liệu');
  await page.getByRole('button', { name: 'Thêm tác phẩm', exact: true }).click();
  await expect(select).toBeDisabled();
  await page.getByLabel('Tên tác phẩm').fill('Bản nháp sẽ hủy, không ghi database');
  const draftRoute = page.url();
  await page.locator('.library-sidebar-desktop').getByRole('link', { name: 'Quầy lưu thông', exact: true }).click();
  const routeConfirmation = page.getByRole('dialog', { name: 'Rời trang khi chưa hoàn tất?' });
  await expect(routeConfirmation).toBeVisible();
  await expect(page).toHaveURL(draftRoute);
  const stay = routeConfirmation.getByRole('button', { name: 'Tiếp tục chỉnh sửa' });
  await expect(stay).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(routeConfirmation.getByRole('button', { name: 'Bỏ thay đổi và rời trang' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(routeConfirmation.getByRole('button', { name: 'Đóng hộp thoại' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(routeConfirmation.getByRole('button', { name: 'Bỏ thay đổi và rời trang' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(routeConfirmation).not.toBeVisible();
  await expect(page.getByLabel('Tên tác phẩm')).toHaveValue('Bản nháp sẽ hủy, không ghi database');
  // Browser history is used by both createBrowserRouter and createHashRouter.
  await page.evaluate(() => history.back());
  await expect(routeConfirmation).toBeVisible();
  await stay.click();
  await expect(page).toHaveURL(draftRoute);
  await captureFullPage(page, { path: 'test-results/catalog-draft-preserved.png', fullPage: true });
  await page.getByRole('button', { name: 'Hủy chỉnh sửa' }).click();
  const discard = page.getByRole('dialog', { name: 'Bỏ thay đổi chưa lưu?' });
  await expect(discard).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(discard).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Hủy chỉnh sửa' })).toBeFocused();
  await expect(page.getByLabel('Tên tác phẩm')).toHaveValue('Bản nháp sẽ hủy, không ghi database');
  await page.getByRole('button', { name: 'Hủy chỉnh sửa' }).click();
  await discard.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await expect(select).toBeEnabled();
  await page.getByRole('button', { name: 'Thêm tác phẩm', exact: true }).click();
  await page.getByLabel('Tên tác phẩm').fill('Bản nháp bỏ khi chuyển trang');
  await page.locator('.library-sidebar-desktop').getByRole('link', { name: 'Quầy lưu thông', exact: true }).click();
  await routeConfirmation.getByRole('button', { name: 'Bỏ thay đổi và rời trang' }).click();
  await expect(page.getByRole('heading', { name: 'Quầy lưu thông', exact: true })).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.getByRole('button', { name: 'Thêm tác phẩm', exact: true })).toBeVisible();
  await expect(page.getByLabel('Tên tác phẩm')).toHaveCount(0);
  for (const [resource,label,name] of [['authors','tác giả',`A0 Writer ${suffix}`],['categories','thể loại',`A0 Topic ${suffix}`],['publishers','nhà xuất bản',`A0 Publisher ${suffix}`]]) {
    await select.selectOption(resource);await page.getByRole('button',{name:`Thêm ${label}`,exact:true}).click();
    await page.getByLabel('Tên',{exact:true}).fill(name);await page.getByRole('button',{name:'Lưu thông tin'}).click();
    await expect(page.getByRole('status')).toHaveText('Đã lưu thông tin.');
    const row=page.getByRole('row').filter({hasText:name});await expect(row).toBeVisible();
    if(resource==='publishers') {
      await row.getByRole('button',{name:'Sửa'}).click();await page.getByLabel('Tên',{exact:true}).fill(name+' edited');
      await page.getByRole('button',{name:'Lưu thông tin'}).click();await expect(page.getByRole('row').filter({hasText:name+' edited'})).toBeVisible();
    }
  }
  await select.selectOption('books');await page.getByRole('button',{name:'Thêm tác phẩm'}).click();
  await page.getByLabel('Tên tác phẩm').fill(`A0 Book ${suffix}`);await page.getByLabel('Mô tả',{exact:true}).fill('Book được nhập qua giao diện.');
  await page.getByRole('button',{name:'Chọn tác giả',exact:true}).click();await page.getByRole('checkbox',{name:`A0 Writer ${suffix}`}).check();
  await page.getByRole('button',{name:'Chọn thể loại',exact:true}).click();await page.getByRole('checkbox',{name:`A0 Topic ${suffix}`}).check();
  await page.getByRole('button',{name:'Lưu thông tin'}).click();await expect(page.getByRole('status')).toHaveText('Đã lưu thông tin.');
  await page.reload();await expect(page.getByRole('row').filter({hasText:`A0 Book ${suffix}`})).toBeVisible();
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      await expect(page.getByText('Vuốt ngang để xem đầy đủ thông tin và thao tác.')).toBeVisible();
      const audit = await new AxeBuilder({ page }).include('.member-table-wrap')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations).toEqual([]);
    }
    await captureFullPage(page, { path: `test-results/catalog-management-${viewport.width}.png`, fullPage: true });
  }
  await page.getByLabel('Loại dữ liệu').selectOption('editions');await page.getByRole('button',{name:'Chọn tác phẩm',exact:true}).click();
  await page.getByRole('radio',{name:`A0 Book ${suffix}`}).click();await page.getByRole('button',{name:'Thêm ấn bản'}).click();
  await expect(page.getByRole('button', { name: /^(Chọn|Thay) tác phẩm$/ })).toBeDisabled();
  await page.getByLabel('ISBN-13 (không bắt buộc)').fill('9780140328721');await page.getByLabel('Năm xuất bản (không bắt buộc)').fill('1988');
  await page.getByRole('button',{name:'Chọn nhà xuất bản'}).click();await page.getByRole('radio',{name:`A0 Publisher ${suffix} edited`}).click();
  await page.getByRole('button',{name:'Lưu thông tin'}).click();await expect(page.getByRole('status')).toHaveText('Đã lưu thông tin.');
  await expect(page.getByRole('table')).toContainText('9780140328721');
  await select.selectOption('authors');const authorRow=page.getByRole('row').filter({hasText:`A0 Writer ${suffix}`});
  await authorRow.getByRole('button',{name:'Xóa',exact:true}).click();await page.getByRole('alertdialog').getByRole('button',{name:'Xác nhận xóa'}).click();
  await expect(page.getByRole('alertdialog').getByRole('alert')).toContainText('Không thể xóa tác giả');
  await page.getByRole('button',{name:'Giữ lại'}).click();
  await page.getByRole('button',{name:'Thêm tác giả'}).click();await page.getByLabel('Tên',{exact:true}).fill(`A0 Delete ${suffix}`);
  await page.getByRole('button',{name:'Lưu thông tin'}).click();await expect(page.getByRole('status')).toHaveText('Đã lưu thông tin.');
  await page.getByRole('row').filter({hasText:`A0 Delete ${suffix}`}).getByRole('button',{name:'Xóa',exact:true}).click();
  await page.getByRole('alertdialog').getByRole('button',{name:'Xác nhận xóa'}).click();await expect(page.getByRole('status')).toHaveText('Đã xóa dữ liệu.');
});

test('Phase 4 Reader: giữ đúng ấn bản, nhận sách, gia hạn và nhận phân bổ kế tiếp trên dữ liệu thật', async ({ page, request }) => {
  test.setTimeout(120000);
  const headers = await staffApi(request);
  const book = await createCatalog(request, headers, '/books', { title: `Lưu thông ${suffix}`, authorIds: [], categoryIds: [] });
  const edition = await createCatalog(request, headers, `/books/${book.id}/editions`, { isbn13: '9780140328721' });
  const branch = await createCatalog(request, headers, '/branches', { code: `C-${suffix}`, name: `Nhận sách ${suffix}` });
  const shelf = await createCatalog(request, headers, '/shelves', { branchId: branch.id, code: 'C1', label: 'Kệ lưu thông', sortOrder: 0 });
  const copy = await createCatalog(request, headers, '/copies', { editionId: edition.id, shelfId: shelf.id, barcode: `C-${suffix}` });
  expect((await request.post(`${core}/copies/${copy.id}/state`, { headers, data: { requestId: randomUUID(), version: copy.version, status: 'AVAILABLE', reason: 'Đã kiểm tra bản sách thử' } })).status()).toBe(200);
  const readerLogin = await request.post(`${core}/auth/login`, { data: { identifier: accounts.READER.email, password, remember: false } });
  expect(readerLogin.status()).toBe(200); const reader = await readerLogin.json();
  const readerHeaders = { Authorization: `Bearer ${reader.accessToken}` };
  await loginCatalog(page, 'READER'); await navigate(page, `/sach/${book.id}`);
  await page.getByRole('button', { name: 'Xem ấn bản và giữ chỗ' }).click();
  await expect(page).toHaveURL(new RegExp(`/sach/${book.id}$`));
  await expect(page.getByRole('heading', { name: 'Các ấn bản' })).toBeFocused();
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/book-detail-${viewport.width}.png`, fullPage: true });
  }
  await page.getByRole('link', { name: 'Đăng ký mượn tại quầy' }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('button', { name: 'Chọn chi nhánh nhận' }).click();
  await page.getByRole('radio', { name: new RegExp(`Nhận sách ${suffix}`) }).click();
  await expect(page.getByText(`Đã chọn: ${branch.code} · ${branch.name}`)).toBeVisible();
  await page.getByRole('button', { name: 'Đăng ký mượn tại quầy' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sẵn sàng nhận' })).toBeVisible();
  const ready = await request.get(`${core}/copies/${copy.id}`, { headers }); expect(ready.status()).toBe(200);
  const readerHolds = await request.get(`${core}/me/holds?page=0&size=100`, { headers: readerHeaders });
  expect(readerHolds.status()).toBe(200);
  const readyHoldRecord = (await readerHolds.json()).items
    .find((item: { hold: { bookId: string; status: string } }) =>
      item.hold.bookId === book.id && item.hold.status === 'READY');
  if (!readyHoldRecord) throw new Error('Reader READY Hold không xuất hiện trong Core.');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(desktopEndpoint ? /#\/$/ : /\/$/);
  await loginCatalog(page, 'LIBRARIAN');
  await navigate(page, '/nhan-vien/bang-dieu-khien');
  await expect(page.getByRole('heading', { name: 'Bảng điều khiển' })).toBeVisible();
  const staffMetrics = page.locator('.staff-dashboard .metric-card');
  await expect(staffMetrics).toHaveCount(6);
  await expect(staffMetrics.getByRole('status')).toHaveCount(0);
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      expect(await page.locator('.staff-dashboard-metrics').evaluate(element =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
      const audit = await new AxeBuilder({ page }).include('.staff-dashboard')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations).toEqual([]);
    }
    await captureFullPage(page, { path: `test-results/staff-dashboard-${viewport.width}.png`, fullPage: true });
  }
  await navigate(page, '/nhan-vien/hop-thu');
  await expect(page.getByRole('heading', { name: 'Hộp thư công việc' })).toBeVisible();
  await expect.poll(async () => {
    const workItems = await request.get(`${insight}/staff/work-items?page=0&size=20`, { headers });
    if (workItems.status() !== 200) return false;
    const body = await workItems.json();
    return body.items.some((item: { aggregateId: string; workType: string }) =>
      item.aggregateId === readyHoldRecord.hold.id && item.workType === 'READY');
  }, { timeout: 30000 }).toBe(true);
  await page.getByRole('button', { name: 'Cập nhật' }).click();
  const inboxTask = page.locator('.staff-work-item').filter({
    hasText: readyHoldRecord.hold.id.slice(0, 8).toUpperCase(),
  });
  await expect(inboxTask).toContainText('Sách đã sẵn sàng bàn giao');
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      const audit = await new AxeBuilder({ page }).include('.staff-work-inbox')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations).toEqual([]);
    }
    await captureFullPage(page, { path: `test-results/staff-inbox-${viewport.width}.png`, fullPage: true });
  }
  await inboxTask.getByRole('link', { name: 'Mở nghiệp vụ' }).click();
  await expect(page.getByRole('region', { name: 'Chi tiết yêu cầu' })).toContainText(book.title);
  await page.getByLabel('Người đọc / mã thành viên').fill(accounts.READER.name);
  await page.getByLabel('Người đọc / mã thành viên').fill(accounts.READER.name);
  await page.getByRole('button', { name: 'Áp dụng bộ lọc' }).click();
  const readyHold = page.locator('.hold-list-card').filter({ hasText: book.title });
  await expect(readyHold).toContainText('Sẵn sàng nhận');
  await expect(readyHold.getByRole('button', { name: 'Đang xem chi tiết' })).toHaveAttribute('aria-pressed', 'true');
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      const audit = await new AxeBuilder({ page }).include('.hold-operations')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations).toEqual([]);
    }
    await captureFullPage(page, { path: `test-results/staff-holds-ready-${viewport.width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Xác nhận đã giao sách' }).click();
  await expect(page.getByRole('status')).toContainText('Đã bàn giao. Hạn trả:');
  const readerLoans = await request.get(`${core}/me/loans?page=0&size=10`, { headers: readerHeaders });
  expect(readerLoans.status()).toBe(200);
  const borrowed = (await readerLoans.json()).items.find((item: { copyId: string }) => item.copyId === copy.id);
  expect(borrowed).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(desktopEndpoint ? /#\/dang-nhap$/ : /\/dang-nhap$/);
  await loginCatalog(page, 'READER'); await navigate(page, '/muon-va-giu-cho');
  const loans = page.getByLabel('Lượt mượn của tôi');
  await expect(loans).toContainText(book.title); await expect(page.getByLabel('Giữ chỗ của tôi')).toContainText('Đã nhận sách');
  await expect.poll(async () => {
    const notifications = await request.get(`${insight}/me/notifications?page=0&size=50`, { headers: readerHeaders });
    if (notifications.status() !== 200) return false;
    const body = await notifications.json();
    return body.items.some((item: { aggregateId: string; eventType: string }) =>
      item.aggregateId === borrowed.loanId && item.eventType === 'COPY_BORROWED');
  }, { timeout: 30000 }).toBe(true);
  await navigate(page, '/thong-bao');
  await expect(page.getByRole('heading', { name: 'Mượn sách thành công' }).first()).toBeVisible();
  const expectedUnread = await request.get(`${insight}/me/notifications/unread-count`, { headers: readerHeaders });
  expect(expectedUnread.status()).toBe(200);
  const unreadBefore = (await expectedUnread.json()).count;
  await expect(page.getByText(`${unreadBefore} thông báo chưa đọc`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Đánh dấu đã đọc', exact: true }).first().click();
  await expect(page.getByText(`${unreadBefore - 1} thông báo chưa đọc`, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(`${unreadBefore - 1} thông báo chưa đọc`, { exact: true })).toBeVisible();
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      const audit = await new AxeBuilder({ page }).include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations).toEqual([]);
    }
    await captureFullPage(page, { path: `test-results/reader-notifications-${viewport.width}.png`, fullPage: true });
  }
  const borrowedLoanLink = page.locator(`a[href*="${borrowed.loanId}"]`).first();
  await expect(borrowedLoanLink).toBeVisible();
  await borrowedLoanLink.click();
  const linkedLoan = page.getByLabel('Lượt mượn được mở từ thông báo');
  await expect(linkedLoan).toContainText(book.title);
  await navigate(page, '/muon-va-giu-cho');
  const activeLoans = page.getByLabel('Lượt mượn của tôi');
  await activeLoans.getByRole('button', { name: 'Gia hạn', exact: true }).click();
  await activeLoans.getByRole('button', { name: 'Xác nhận gia hạn' }).click();
  await expect(activeLoans).toContainText('Đã gia hạn 1 lần');
  const renewed = await request.get(`${core}/loans/${borrowed.loanId}`, { headers: readerHeaders });
  expect(renewed.status()).toBe(200); const renewedBody = await renewed.json();
  expect(renewedBody.renewalCount).toBe(1); expect(Date.parse(renewedBody.dueAt)).toBeGreaterThan(Date.parse(borrowed.dueAt));
  await navigate(page, `/giu-cho/${book.id}/${edition.id}`);
  await page.getByRole('button', { name: 'Chọn chi nhánh nhận' }).click();
  await page.getByRole('radio', { name: new RegExp(`Nhận sách ${suffix}`) }).click();
  await expect(page.getByText(`Đã chọn: ${branch.code} · ${branch.name}`)).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận giữ chỗ' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Đang chờYêu cầu đã được ghi' })).toBeVisible();
  await page.getByRole('link', { name: 'Xem các lượt mượn và giữ chỗ của tôi' }).click();
  await page.getByRole('button', { name: 'Xem thời gian dự kiến' }).click();
  await expect(page.getByLabel('Ước tính giữ chỗ')).toContainText('chưa phải thông báo đến nhận');
  const waiting = await request.get(`${core}/me/holds?size=100`, { headers: readerHeaders }); expect(waiting.status()).toBe(200);
  const waitingHold = (await waiting.json()).items.find((item: { hold: { status: string } }) => item.hold.status === 'WAITING').hold;
  const estimate = await request.get(`${core}/holds/${waitingHold.id}/estimate`, { headers: readerHeaders }); expect(estimate.status()).toBe(200);
  const eta = await estimate.json(); expect(eta.reason).toBe('CONDITIONAL'); expect(Date.parse(eta.estimatedAt)).toBe(Date.parse(renewedBody.dueAt));
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/hold-eta-${viewport.width}.png`, fullPage: true });
  }
  await expect(page.getByLabel('Giữ chỗ của tôi')).toContainText('Đang chờ');
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/reader-circulation-${viewport.width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page).toHaveURL(desktopEndpoint ? /#\/$/ : /\/$/);
  await loginCatalog(page, 'LIBRARIAN'); await navigate(page, '/nhan-vien/luu-thong');
  await page.getByLabel('Mã vạch bản sách').fill(copy.barcode);
  await page.getByRole('button', { name: 'Tra bản sách' }).click();
  await page.getByRole('button', { name: 'Tìm lượt đang mượn của bản này' }).click();
  const returnedHistory = page.getByLabel('Lịch sử tại quầy');
  await expect(returnedHistory).toContainText(book.title);
  await returnedHistory.getByRole('button', { name: 'Nhận trả', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận nhận trả' }).click();
  await expect(returnedHistory).toContainText('Không có lượt mượn phù hợp.');
  const returned = await request.get(`${core}/loans?copyId=${copy.id}`, { headers });
  expect((await returned.json()).items[0].status).toBe('RETURNED');
  const afterReturn = await request.get(`${core}/me/holds?size=100`, { headers: readerHeaders });
  expect(afterReturn.status()).toBe(200);
  const allocated = (await afterReturn.json()).items
    .find((item: { hold: { id: string } }) => item.hold.id === waitingHold.id);
  expect(allocated?.hold).toMatchObject({ status: 'READY', copyId: copy.id });
  const allocatedCopy = await request.get(`${core}/copies/${copy.id}`, { headers });
  expect(allocatedCopy.status()).toBe(200);
  expect((await allocatedCopy.json()).status).toBe('ON_HOLD');
  await page.reload(); await expect(page.getByLabel('Lịch sử tại quầy')).toContainText('Đã trả');
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await loginCatalog(page, 'READER'); await navigate(page, '/muon-va-giu-cho');
  await expect(page.getByLabel('Giữ chỗ của tôi')).toContainText('Sẵn sàng nhận');
  await expect.poll(async () => {
    const notifications = await request.get(`${insight}/me/notifications?page=0&size=50`, { headers: readerHeaders });
    if (notifications.status() !== 200) return false;
    const body = await notifications.json();
    return body.items.some((item: { aggregateId: string; eventType: string }) =>
      item.aggregateId === waitingHold.id && item.eventType === 'HOLD_READY');
  }, { timeout: 30000 }).toBe(true);
  await navigate(page, '/thong-bao');
  await expect(page.getByRole('heading', { name: 'Sách đã sẵn sàng nhận' }).first()).toBeVisible();
  const readyHoldLink = page.locator(`a[href*="${waitingHold.id}"]`).first();
  await expect(readyHoldLink).toBeVisible();
  await readyHoldLink.click();
  const linkedHold = page.getByLabel('Giữ chỗ được mở từ thông báo');
  await expect(linkedHold).toContainText(book.title);
  await expect(linkedHold).toContainText('Sẵn sàng nhận');
});

test('Phase 4 quầy: mượn, gia hạn, quét nhận trả và tải CSV qua giao diện', async ({ page, request }) => {
  test.setTimeout(120000);
  const headers = await staffApi(request);
  const book = await createCatalog(request, headers, '/books', { title: `Quầy ${suffix}`, authorIds: [], categoryIds: [] });
  const edition = await createCatalog(request, headers, `/books/${book.id}/editions`, { isbn13: '9780140328721' });
  const branch = await createCatalog(request, headers, '/branches', { code: `Q-${suffix}`, name: `Quầy thử ${suffix}` });
  const shelf = await createCatalog(request, headers, '/shelves', { branchId: branch.id, code: 'Q1', label: 'Kệ tại quầy', sortOrder: 0 });
  const copy = await createCatalog(request, headers, '/copies', { editionId: edition.id, shelfId: shelf.id, barcode: `Q_%/${suffix}` });
  expect((await request.post(`${core}/copies/${copy.id}/state`, { headers, data: { requestId: randomUUID(), version: copy.version, status: 'AVAILABLE', reason: 'Bản sách kiểm thử quầy' } })).status()).toBe(200);
  await loginCatalog(page, 'LIBRARIAN'); await navigate(page, '/nhan-vien/luu-thong');
  await page.getByLabel('Mã thành viên hoặc họ tên').fill(accounts.READER.name);
  await page.getByRole('button', { name: 'Tìm thành viên' }).click();
  await page.getByRole('button', { name: new RegExp(accounts.READER.name) }).click();
  await page.getByLabel('Mã vạch bản sách').fill(copy.barcode);
  await page.getByRole('button', { name: 'Tra bản sách' }).click();
  await page.getByRole('button', { name: 'Cho mượn bản sách này' }).click();
  const confirmation = page.getByRole('group', { name: 'Xác nhận cho mượn' });
  await expect(confirmation).toContainText(accounts.READER.name); await expect(confirmation).toContainText(copy.barcode);
  await confirmation.getByRole('button', { name: 'Xác nhận cho mượn' }).click();
  await expect(page.getByText(/Đã cho mượn. Hạn trả/)).toBeVisible();
  await page.getByRole('button', { name: 'Giao dịch tiếp theo' }).click();
  await page.reload();
  await page.getByLabel('Mã vạch bản sách').fill(copy.barcode); await page.getByRole('button', { name: 'Tra bản sách' }).click();
  await page.getByRole('button', { name: 'Tìm lượt đang mượn của bản này' }).click();
  const history = page.getByLabel('Lịch sử tại quầy');
  await expect(history.locator('article')).toHaveCount(1); await expect(history).toContainText(book.title);
  await history.getByRole('button', { name: 'Gia hạn tại quầy', exact: true }).click();
  await history.getByRole('button', { name: 'Xác nhận gia hạn tại quầy' }).click();
  await expect(history).toContainText('Đã gia hạn 1 lần');
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      const audit = await new AxeBuilder({ page }).include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations).toEqual([]);
    }
    await captureFullPage(page, { path: `test-results/staff-circulation-${viewport.width}.png`, fullPage: true });
  }
  await history.getByRole('button', { name: 'Nhận trả', exact: true }).click();
  await history.getByRole('button', { name: 'Xác nhận nhận trả' }).click();
  await expect(history).toContainText('Không có lượt mượn phù hợp.');
  await page.getByLabel('Trạng thái lượt mượn').selectOption('RETURNED'); await expect(history).toContainText(book.title);
  await page.reload();
  const actual = await request.get(`${core}/loans?copyId=${copy.id}`, { headers }); expect(actual.status()).toBe(200);
  const items = (await actual.json()).items; expect(items).toHaveLength(1); expect(items[0].status).toBe('RETURNED'); expect(items[0].renewalCount).toBe(1);
  const currentCopy = await request.get(`${core}/copies/${copy.id}`, { headers }); expect((await currentCopy.json()).status).toBe('AVAILABLE');
  await page.getByRole('link', { name: 'Xem báo cáo mượn theo chi nhánh' }).click();
  const now = new Date(), from = new Date(now.getTime() - 2 * 86400000).toISOString().slice(0, 10), to = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel('Từ ngày (bao gồm)').fill(from); await page.getByLabel('Đến ngày (không bao gồm)').fill(to);
  await page.getByRole('button', { name: 'Chọn chi nhánh báo cáo', exact: true }).click();
  await page.getByRole('radio', { name: new RegExp(branch.name) }).click();
  await page.getByRole('button', { name: 'Xem báo cáo', exact: true }).click();
  const report = page.getByRole('region', { name: 'Kết quả báo cáo' });
  await expect(report.locator('tbody tr')).toHaveCount(1); await expect(report.locator('tbody')).toContainText(branch.name);
  await expect(report.locator('dd')).toHaveText(['1', '0', '1', '0']);
  const downloadPromise = page.waitForEvent('download');
  await report.getByRole('button', { name: 'Tải CSV theo bộ lọc này' }).click();
  const download = await downloadPromise; expect(download.suggestedFilename()).toBe(`luu-thong-${from}-${to}.csv`);
  const output = `test-results/circulation-${suffix}.csv`; await download.saveAs(output);
  const csv = await readFile(output, 'utf8'); expect(csv.charCodeAt(0)).toBe(0xfeff); expect(csv).toContain(branch.name);
  expect(csv).not.toContain(accounts.READER.email); expect(csv).not.toContain(accounts.READER.name);
  if (desktopEndpoint) expect(await page.evaluate(() => '__TAURI_INTERNALS__' in window)).toBe(true);
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/circulation-report-${viewport.width}.png`, fullPage: true });
  }
  await page.reload(); await expect(page.getByRole('heading', { name: 'Báo cáo mượn theo chi nhánh' })).toBeVisible();
});

test('Phase 2 Admin: Branch/Shelf/Copy maintenance và xung đột version thật', async ({ page, request }) => {
  test.setTimeout(120_000);
  const headers=await staffApi(request);
  const book=await createCatalog(request,headers,'/books',{title:`A0 Inventory ${suffix}`,authorIds:[],categoryIds:[]});
  const edition=await createCatalog(request,headers,`/books/${book.id}/editions`,{isbn13:'9780140328721'});
  await loginCatalog(page,'ADMIN');await navigate(page,'/nhan-vien/danh-muc');const select=page.getByLabel('Loại dữ liệu');
  await select.selectOption('branches');await page.getByRole('button',{name:'Thêm chi nhánh'}).click();
  await page.getByLabel('Mã chi nhánh').fill(`A0-${suffix}`);await page.getByLabel('Tên chi nhánh').fill('Chi nhánh kiểm thử');
  await page.getByRole('button',{name:'Lưu thông tin'}).click();await expect(page.getByRole('status')).toHaveText('Đã lưu thông tin.');
  await select.selectOption('shelves');await page.getByRole('button',{name:'Thêm kệ sách'}).click();
  await page.getByRole('button',{name:'Chọn chi nhánh'}).click();await page.getByRole('radio',{name:new RegExp(`A0-${suffix.toUpperCase()}`)}).click();
  await page.getByLabel('Mã kệ',{exact:true}).fill('S1');await page.getByLabel('Nhãn kệ').fill('Kệ kiểm thử');
  await page.getByRole('button',{name:'Lưu thông tin'}).click();await expect(page.getByRole('status')).toHaveText('Đã lưu thông tin.');
  await select.selectOption('copies');await page.getByRole('button',{name:'Thêm bản sách'}).click();await page.getByLabel('Mã vạch').fill(`E2E-${suffix}`);
  await page.getByRole('button',{name:'Chọn kệ sách'}).click();await page.getByRole('radio',{name:/S1 · Kệ kiểm thử/}).click();
  await page.getByRole('button',{name:'Chọn tác phẩm để chọn ấn bản'}).click();await page.getByRole('radio',{name:`A0 Inventory ${suffix}`}).click();
  await page.getByRole('button',{name:'Chọn ấn bản',exact:true}).click();await page.getByRole('radio',{name:/9780140328721/}).click();
  await page.getByRole('button',{name:'Lưu thông tin'}).click();await expect(page.getByRole('status')).toHaveText('Đã lưu thông tin.');
  const row=page.getByRole('row').filter({hasText:`E2E-${suffix}`});await expect(row).toContainText('IN_PROCESS');await row.getByRole('button',{name:'Sửa'}).click();
  const copiesResponse=await request.get(`${core}/copies?editionId=${edition.id}`,{headers});expect(copiesResponse.status()).toBe(200);
  const copy=(await copiesResponse.json()).items[0];
  const changed=await request.patch(`${core}/copies/${copy.id}`,{headers,data:{editionId:edition.id,shelfId:copy.shelfId,barcode:`UPDATED-${suffix}`,version:copy.version}});expect(changed.status()).toBe(200);
  await page.getByLabel('Mã vạch').fill(`STALE-${suffix}`);await page.getByRole('button',{name:'Lưu thông tin'}).click();
  await expect(page.getByRole('alert')).toContainText('Bản sách đã được cập nhật');await expect(page.getByRole('button',{name:'Lưu thông tin'})).toBeDisabled();
  await page.getByRole('button',{name:'Hủy chỉnh sửa'}).click();
  const discardConflict = page.getByRole('dialog', { name: 'Bỏ thay đổi chưa lưu?' });
  await expect(discardConflict).toBeVisible();
  await discardConflict.getByRole('button', { name: 'Bỏ thay đổi', exact: true }).click();
  await expect(page.getByRole('row').filter({hasText:`UPDATED-${suffix}`})).toBeVisible();
  await captureFullPage(page, {path:'test-results/catalog-staff-copy.png',fullPage:true});
});

test('Phase 5 kiểm kê: mở phiên, quét sai kệ, chốt và xác nhận chuyển Copy', async ({ page, request }) => {
  test.setTimeout(120_000);
  const headers = await staffApi(request);
  const book = await createCatalog(request, headers, '/books', { title: `Kiểm kê ${suffix}`, authorIds: [], categoryIds: [] });
  const edition = await createCatalog(request, headers, `/books/${book.id}/editions`, { isbn13: '9780140328721' });
  const branch = await createCatalog(request, headers, '/branches', { code: `K-${suffix}`, name: `Chi nhánh kiểm kê ${suffix}` });
  const registered = await createCatalog(request, headers, '/shelves', { branchId: branch.id, code: 'K1', label: 'Kệ đăng ký', sortOrder: 0 });
  const observed = await createCatalog(request, headers, '/shelves', { branchId: branch.id, code: 'K2', label: 'Kệ quét thấy', sortOrder: 1 });
  const copy = await createCatalog(request, headers, '/copies', { editionId: edition.id, shelfId: registered.id, barcode: `KK-${suffix}` });
  const ready = await request.post(`${core}/copies/${copy.id}/state`, { headers,
    data: { requestId: randomUUID(), version: copy.version, status: 'AVAILABLE', reason: 'Đã kiểm tra bản sách kiểm thử' } });
  expect(ready.status()).toBe(200);
  const reader = await request.post(`${core}/auth/login`, { data: { identifier: accounts.READER.email, password, remember: false } });
  expect((await request.get(`${core}/inventory-sessions`, { headers: { Authorization: `Bearer ${(await reader.json()).accessToken}` } })).status()).toBe(403);

  await loginCatalog(page, 'LIBRARIAN');
  await navigate(page, '/nhan-vien/kiem-ke');
  await page.getByRole('button', { name: 'Chọn chi nhánh', exact: true }).click();
  await page.getByRole('radio', { name: new RegExp(`K-${suffix.toUpperCase()}`) }).click();
  await page.getByRole('button', { name: 'Mở phiên kiểm kê' }).click();
  await expect(page).toHaveURL(/\/nhan-vien\/kiem-ke\/[a-f0-9-]{36}/);
  await expect(page.getByText(/1 bản trong snapshot/)).toBeVisible();
  // A synthetic video tests the real decoder, not the webcam or Windows permission UI.
  const cameraValue = 'LAMS-E2E-CAMERA-001';
  const matrix = new QRCodeWriter().encode(cameraValue, BarcodeFormat.QR_CODE, 240, 240, new Map());
  const pixels = Array.from({ length: 240 * 240 }, (_, index) => matrix.get(index % 240, Math.floor(index / 240)));
  await page.evaluate(pixels => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 240;
    const context = canvas.getContext('2d')!;
    const drawFrame = () => {
      context.fillStyle = 'white'; context.fillRect(0, 0, 240, 240);
      context.fillStyle = 'black';
      pixels.forEach((black, index) => { if (black) context.fillRect(index % 240, Math.floor(index / 240), 1, 1); });
    };
    drawFrame();
    // Keep producing frames and retain the canvas for the lifetime of the stream.
    const frames = window.setInterval(drawFrame, 100);
    const native = Object.getOwnPropertyDescriptor(window, 'BarcodeDetector');
    const media = Object.getOwnPropertyDescriptor(navigator.mediaDevices, 'getUserMedia');
    const tracks: MediaStreamTrack[] = [];
    Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: undefined });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      const stream = canvas.captureStream(10); tracks.push(...stream.getTracks()); return stream;
    } });
    Object.assign(window, { __lamsCameraFixture: { tracks, cleanup: () => {
      window.clearInterval(frames);
      tracks.forEach(track => track.stop());
      if (native) Object.defineProperty(window, 'BarcodeDetector', native); else Reflect.deleteProperty(window, 'BarcodeDetector');
      if (media) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', media); else Reflect.deleteProperty(navigator.mediaDevices, 'getUserMedia');
    } } });
  }, pixels);
  try {
    await page.getByRole('button', { name: 'Quét bằng camera', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Mã vạch' })).toHaveValue(cameraValue, { timeout: 15_000 });
    await expect(page.getByText('Đã đọc mã ' + cameraValue + '. Kiểm tra mã và bấm Ghi nhận scan để gửi.')).toBeVisible();
    await expect(page.getByText(/0 lượt quét/).first()).toBeVisible();
    expect(await page.evaluate(() => {
      const fixture = (window as unknown as { __lamsCameraFixture: { tracks: MediaStreamTrack[] } }).__lamsCameraFixture;
      return fixture.tracks.length > 0 && fixture.tracks.every(track => track.readyState === 'ended');
    })).toBe(true);
    await captureFullPage(page, { path: 'test-results/camera-fallback.png', fullPage: true });
  } finally {
    await page.evaluate(() => {
      const state = window as unknown as { __lamsCameraFixture?: { cleanup: () => void } };
      state.__lamsCameraFixture?.cleanup(); delete state.__lamsCameraFixture;
    });
  }
  await page.getByRole('radio', { name: 'K2 · Kệ quét thấy' }).click();
  await page.getByRole('textbox', { name: 'Mã vạch' }).fill(`KK-${suffix}`);
  await page.getByRole('button', { name: 'Ghi nhận scan' }).click();
  await expect(page.getByText(/Đã nhận: KK-/)).toBeVisible();
  await expect(page.getByText(/1 lượt quét/).first()).toBeVisible();
  await page.getByLabel(/Đã kiểm tra các lượt quét/).check();
  await page.getByRole('button', { name: 'Chốt phiên' }).click();
  await expect(page.getByRole('heading', { name: 'Sai kệ' })).toBeVisible();
  await page.getByLabel('Cách xử lý').selectOption('MOVE_TO_SCANNED_SHELF');
  await page.getByLabel('Lý do và kết quả kiểm tra').fill('Đã đối chiếu bản sách tại kệ K2');
  await page.getByLabel('Tôi đã kiểm tra bản sách hiện tại và xác nhận quyết định này.').check();
  await page.getByRole('button', { name: 'Lưu kết quả rà soát' }).click();
  await expect(page.getByText(/Đã chuyển về kệ quét/)).toBeVisible();
  const updated = await request.get(`${core}/copies/${copy.id}`, { headers });
  expect(updated.status()).toBe(200);
  expect((await updated.json()).shelfId).toBe(observed.id);
  await page.reload();
  await expect(page.getByText(/Đã chuyển về kệ quét/)).toBeVisible();
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      const audit = await new AxeBuilder({ page }).include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations).toEqual([]);
    }
    await captureFullPage(page, { path: `test-results/inventory-${viewport.width}.png`, fullPage: true });
  }
  if (desktopEndpoint) expect(await page.evaluate(() => '__TAURI_INTERNALS__' in window)).toBe(true);
});

for (const role of ['READER', 'LIBRARIAN', 'ADMIN'] as const) {
test(`Ảnh danh mục phủ khung, menu và quay lại hoạt động (${role})`, async ({ page, request }) => {
  test.setTimeout(60_000);
  const headers = await staffApi(request);
  await createCatalog(request, headers, '/categories', { name: `A0 Chuyên mục ${role} ${suffix}` });
    await loginCatalog(page, role);
    await navigate(page, role === 'READER' ? '/the-loai' : '/nhan-vien/bang-dieu-khien');
    await expect(page.locator('.appearance-loading')).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 1000 });
    const collapse = page.getByRole('button', { name: 'Thu gọn thanh điều hướng' });
    await collapse.click();
    await expect(page.locator('.library-sidebar-desktop')).toHaveClass(/is-collapsed/);
    const expand = page.getByRole('button', { name: 'Mở rộng thanh điều hướng' });
    await expect(expand).toBeEnabled();
    await expand.click();
    await expect(page.locator('.library-sidebar-desktop')).not.toHaveClass(/is-collapsed/);
    await captureFullPage(page, { path: `test-results/glass-${role}.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 900 });
    const roleMenu = page.getByRole('button', { name: role === 'READER' ? 'Mở menu thư viện' : 'Mở menu nhân viên' });
    await roleMenu.click();
    await expect(page.getByRole('dialog', { name: 'Menu thư viện' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Menu thư viện' })).not.toBeVisible();
    await expect(roleMenu).toBeFocused();
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const path of ['/tac-gia', '/the-loai']) {
      await navigate(page, path);
      const hero = page.locator('.directory-hero');
      await expect(hero).toBeVisible();
      await expect.poll(() => hero.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      const bounds = await hero.boundingBox();
      const photo = await hero.locator('img').boundingBox();
      expect(Math.abs(bounds!.width - photo!.width)).toBeLessThan(3);
      if (path === '/the-loai') {
        await expect(page.locator('.directory-card .directory-visual img').first()).toBeVisible();
        expect(await page.locator('.directory-card .directory-visual-fallback').count()).toBe(0);
      }
      if (role === 'READER') await captureFullPage(page, { path: `test-results/hero-${path.slice(1)}.png`, fullPage: true });
    }
    await page.setViewportSize({ width: 390, height: 900 });
    const trigger = page.getByRole('button', { name: 'Mở menu thư viện' });
    await trigger.click();
    await expect(page.getByRole('dialog', { name: 'Menu thư viện' })).toBeVisible();
    await page.getByRole('button', { name: 'Đóng menu', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Menu thư viện' })).not.toBeVisible();
    await expect(trigger).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate(page, '/the-loai');
  // Điều hướng trong cùng ứng dụng để kiểm tra nút quay lại, kể cả HashRouter.
  await page.evaluate((desktop) => {
    if (desktop) location.hash = '/duong-dan-khong-ton-tai';
    else { history.pushState({ idx: (history.state?.idx ?? 0) + 1 }, '', '/duong-dan-khong-ton-tai'); dispatchEvent(new PopStateEvent('popstate')); }
  }, !!desktopEndpoint);
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  await page.getByRole('button', { name: 'Quay lại' }).click();
  await expect(page.getByRole('heading', { name: /Thể loại|Khám phá sách/, exact: true })).toBeVisible();
});
}

test('Admin hủy phiên kiểm kê và tải lại vẫn giữ biên nhận đã hủy', async ({ page, request }) => {
  const headers = await staffApi(request);
  const branch = await createCatalog(request, headers, '/branches', { code: `H-${suffix}`, name: `Chi nhánh hủy ${suffix}` });
  await loginCatalog(page, 'ADMIN');
  await navigate(page, '/nhan-vien/kiem-ke');
  await page.getByRole('button', { name: 'Chọn chi nhánh', exact: true }).click();
  await page.getByRole('radio', { name: new RegExp(branch.code) }).click();
  await page.getByRole('button', { name: 'Mở phiên kiểm kê' }).click();
  await expect(page.getByRole('heading', { name: 'Phiên kiểm kê', exact: true })).toBeVisible();
  await page.getByRole('radio', { name: 'Hủy phiên' }).check();
  await page.getByLabel('Lý do hủy (bắt buộc)').fill('Đã kiểm tra và hủy phiên thử nghiệm');
  await page.getByLabel(/Đã kiểm tra các lượt quét/).check();
  await page.getByRole('button', { name: 'Hủy phiên', exact: true }).click();
  await expect(page.getByText('Đã hủy', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Đã hủy', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ghi nhận scan' })).toHaveCount(0);
  await captureFullPage(page, { path: 'test-results/admin-cancelled-session.png', fullPage: true });
});

test('Admin dashboard, tài khoản và kiểm duyệt responsive với dữ liệu thật', async ({ page, request }) => {
  test.setTimeout(120_000);
  const headers = await staffApi(request);
  const book = await createCatalog(request, headers, '/books', {
    title: `Admin moderation ${suffix}`, authorIds: [], categoryIds: [],
  });
  const readerLogin = await request.post(`${core}/auth/login`, {
    data: { identifier: accounts.READER.email, password, remember: false },
  });
  expect(readerLogin.status()).toBe(200);
  const readerHeaders = { Authorization: `Bearer ${(await readerLogin.json()).accessToken}` };
  const review = await request.post(`${core}/books/${book.id}/reviews`, {
    headers: readerHeaders, data: { body: 'Đánh giá dùng để kiểm tra quy trình kiểm duyệt quản trị.', rating: 4 },
  });
  expect(review.status()).toBe(201);
  const report = await request.post(`${core}/books/${book.id}/reviews/${(await review.json()).reviewId}/reports`, {
    headers, data: { reason: 'Nội dung cần được quản trị viên xem xét theo quy định.' },
  });
  expect(report.status()).toBe(201);
  await loginCatalog(page, 'ADMIN');
  await navigate(page, '/nhan-vien/bang-dieu-khien');
  await expect(page.getByRole('heading', { name: 'Quản trị hệ thống' })).toBeVisible();
  const adminMetrics = page.locator('.admin-dashboard .admin-metric-card');
  await expect(adminMetrics).toHaveCount(6);
  await expect(adminMetrics.getByRole('status')).toHaveCount(0);
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      expect(await page.locator('.admin-dashboard-metrics').evaluate(element =>
        getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
    }
    await captureFullPage(page, { path: `test-results/admin-dashboard-${viewport.width}.png`, fullPage: true });
    const audit = await new AxeBuilder({ page }).include('.admin-dashboard')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(audit.violations).toEqual([]);
  }

  await navigate(page, '/nhan-vien/tai-khoan');
  await expect(page.getByRole('heading', { name: 'Tài khoản và phân quyền' })).toBeVisible();
  await page.getByRole('button', { name: 'Chi tiết' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Hồ sơ quản trị' })).toBeVisible();
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/admin-account-drawer-${viewport.width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Đóng' }).click();
  await navigate(page, '/nhan-vien/bao-cao-danh-gia');
  await expect(page.getByRole('heading', { name: 'Báo cáo đánh giá' })).toBeVisible();
  await expect(page.getByText('1 báo cáo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xem chi tiết' }).click();
  const reportDrawer = page.getByRole('dialog', { name: 'Chi tiết báo cáo' });
  await expect(reportDrawer.getByText('Đánh giá dùng để kiểm tra quy trình kiểm duyệt quản trị.', { exact: true })).toBeVisible();
  await expect(reportDrawer.getByRole('heading', { name: `${book.title} · 4/5` })).toBeVisible();
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/admin-review-drawer-${viewport.width}.png`, fullPage: true });
    const audit = await new AxeBuilder({ page }).include('.admin-detail-drawer')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(audit.violations).toEqual([]);
  }
  await reportDrawer.getByLabel('Lý do quyết định').fill('Đã rà soát và xác nhận cần ẩn theo quy định.');
  await reportDrawer.getByRole('button', { name: 'Ẩn đánh giá' }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Ẩn đánh giá này?' });
  await expect(confirmation.getByRole('button', { name: 'Quay lại' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(confirmation.getByRole('button', { name: 'Xác nhận ẩn đánh giá' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(confirmation.getByRole('button', { name: 'Quay lại' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(confirmation).toHaveCount(0);
  await expect(reportDrawer.getByRole('button', { name: 'Ẩn đánh giá' })).toBeFocused();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Shift+Tab');
  await expect(confirmation.getByRole('button', { name: 'Xác nhận ẩn đánh giá' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('Đã lưu quyết định.');
  await expect(page.getByText('Không có báo cáo ở trang này.')).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

test('Phase 6 tìm sách: không dấu, xếp hạng, tác giả, ISBN và trang ổn định', async ({ page, request }) => {
  const headers = await staffApi(request);
  const author = await createCatalog(request, headers, '/authors', { name: `Nguyễn Bình ${suffix}` });
  const category = await createCatalog(request, headers, '/categories', { name: `Khảo cứu ${suffix}` });
  const aliasName = `Research ${suffix}`;
  const createdAlias = await request.post(`${core}/category-aliases`, {
    headers, data: { categoryId: category.id, name: aliasName },
  });
  expect(createdAlias.status()).toBe(201);
  expect((await request.post(`${core}/category-aliases`, { headers,
    data: { categoryId: category.id, name: aliasName.toUpperCase() } })).status()).toBe(409);
  const exact = await createCatalog(request, headers, '/books', {
    title: `Đường về ${suffix}`, description: 'Một câu chuyện', authorIds: [], categoryIds: [category.id],
  });
  const prefix = await createCatalog(request, headers, '/books', {
    title: `Đường về ${suffix} nhà`, authorIds: [], categoryIds: [],
  });
  const byAuthor = await createCatalog(request, headers, '/books', {
    title: `Tập truyện ${suffix}`, authorIds: [author.id], categoryIds: [],
  });
  const isbnStem = `978${String(parseInt(suffix, 16)).padStart(9, '0').slice(-9)}`;
  const checkDigit = (10 - Array.from(isbnStem).reduce((sum, digit, index) => sum + Number(digit) * (index % 2 ? 3 : 1), 0) % 10) % 10;
  const isbn = `${isbnStem}${checkDigit}`;
  await createCatalog(request, headers, `/books/${prefix.id}/editions`, { isbn13: isbn });
  await navigate(page, `/sach?query=duong%20ve%20${suffix}&sort=relevance&size=1`);
  await expect(page.getByRole('link', { name: `Xem sách ${exact.title}`, exact: true })).toBeVisible();
  await expect(page.getByText(/Trang 1 \/ \d+ · \d+ kết quả/)).toBeVisible();
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await expect(page.getByRole('link', { name: `Xem sách ${prefix.title}`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: `Xem sách ${prefix.title}`, exact: true })).toBeVisible();
  const authorSearch = await request.get(`${core}/public/catalog/books`, {
    params: { query: `nguyen binh ${suffix}`, sort: 'relevance' },
  });
  expect(authorSearch.status()).toBe(200);
  expect((await authorSearch.json()).items[0].id).toBe(byAuthor.id);
  const isbnSearch = await request.get(`${core}/public/catalog/books`, {
    params: { query: isbn, sort: 'relevance' },
  });
  expect(isbnSearch.status()).toBe(200);
  expect((await isbnSearch.json()).items[0].id).toBe(prefix.id);
  await navigate(page, '/sach');
  await page.getByLabel('Tên thể loại hoặc bí danh').fill(category.name);
  await expect.poll(() => {
    const location = new URL(page.url());
    const params = desktopEndpoint ? new URLSearchParams(location.hash.split('?')[1] ?? '') : location.searchParams;
    return params.get('categoryTerm');
  }).toBe(category.name);
  await expect(page.getByRole('link', { name: `Xem sách ${exact.title}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Xem sách ${prefix.title}`, exact: true })).toHaveCount(0);
  await page.getByLabel('Tên thể loại hoặc bí danh').fill(aliasName);
  await expect(page.getByRole('link', { name: `Xem sách ${exact.title}`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `Xem sách ${prefix.title}`, exact: true })).toHaveCount(0);
});

test('Landing và Catalog công khai: tìm sách thật, menu mobile và sáu mốc responsive', async ({ page, request }) => {
  test.setTimeout(120_000);
  const headers = await staffApi(request);
  const category = await createCatalog(request, headers, '/categories', { name: `A0 Khám phá ${suffix}` });
  const book = await createCatalog(request, headers, '/books', {
    title: `Cuốn sách khám phá ${suffix}`, authorIds: [], categoryIds: [category.id],
  });
  expect((await request.get(`${core}/public/catalog/books?query=${suffix}`)).status()).toBe(200);
  expect((await request.post(`${core}/books`, { data: { title: 'Không được ghi' } })).status()).toBe(401);
  await navigate(page, '/');
  await page.reload();
  await expect(page.getByRole('heading', { name: /Cuốn sách tiếp theo/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sách mới cập nhật' })).toBeVisible();
  await expect(page.getByRole('link', { name: category.name, exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sách mới cập nhật' })
    .getByRole('link', { name: `Xem sách ${book.title}` })).toBeVisible();
  const categoryShelf = page.getByRole('region', { name: 'Sách theo thể loại' });
  await categoryShelf.getByRole('button', { name: category.name, exact: true }).click();
  await expect(categoryShelf.getByRole('link', { name: `Xem sách ${book.title}` })).toBeVisible();
  for (const width of [390, 768, 1024, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/landing-${width}.png`, fullPage: true });
  }
  await page.getByPlaceholder('Bạn muốn đọc gì?').fill(suffix);
  await page.getByRole('button', { name: 'Tìm sách' }).click();
  await expect(page).toHaveURL(new RegExp(`/sach\\?query=${suffix}`));
  await expect(page.getByRole('heading', { name: 'Khám phá sách' })).toBeVisible();
  await expect(page.getByRole('link', { name: `Xem sách ${book.title}` })).toBeVisible();
  for (const width of [390, 768, 1024, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/catalog-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 900 });
  const filterTrigger = page.getByRole('button', { name: /^Bộ lọc/ });
  await filterTrigger.click();
  const filterDialog = page.getByRole('dialog', { name: 'Bộ lọc sách' });
  await expect(filterDialog).toBeVisible();
  await expect(filterDialog.getByRole('button', { name: 'Đóng hộp thoại' })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await filterDialog.getByRole('button', { name: 'Chọn thể loại' }).click();
  await filterDialog.getByRole('option', { name: category.name, exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await expect(filterDialog).toBeVisible();
  await expect(filterDialog.getByRole('button', { name: 'Chọn thể loại' })).toBeFocused();
  await filterDialog.getByRole('button', { name: 'Đóng hộp thoại' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(filterDialog.getByRole('button', { name: 'Xem kết quả' })).toBeFocused();
  await captureFullPage(page, { path: 'test-results/catalog-filter-mobile.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(filterDialog).toHaveCount(0);
  await expect(filterTrigger).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
  const trigger = page.getByRole('button', { name: 'Mở menu thư viện' });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Menu thư viện' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Menu thư viện' })).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await page.reload();
  await expect(page.getByRole('link', { name: `Xem sách ${book.title}` })).toBeVisible();
});

test('Phase 7: reader bị chặn, nhân viên thấy trạng thái chưa có nguồn dữ liệu', async ({ page, request }) => {
  const insight = process.env.LAMS_E2E_INSIGHT_URL!;
  const reader = await request.post(`${core}/auth/login`, { data: {
    identifier: accounts.READER.email, password, remember: false,
  } });
  expect(reader.status()).toBe(200);
  const token = String((await reader.json()).accessToken);
  expect((await request.get(`${insight}/acquisition/recommendations`,
    { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(403);

  await loginCatalog(page, 'LIBRARIAN');
  await navigate(page, '/nhan-vien/de-xuat-bo-sung');
  await expect(page.getByRole('heading', { name: 'Đề xuất bổ sung sách' })).toBeVisible();
  await expect(page.getByText(/Chưa có đề xuất phù hợp/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Tạo đề xuất/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/Chưa có đề xuất phù hợp/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await captureFullPage(page, { path: 'test-results/acquisition-empty-390.png', fullPage: true });
});

test('Phase 7: Core facts, Insight và giao diện lưu quyết định trên PostgreSQL thật', async ({ page, request }) => {
  test.setTimeout(120_000);
  const insight = process.env.LAMS_E2E_INSIGHT_URL!;
  const staffHeaders = await staffApi(request);
  const book = await createCatalog(request, staffHeaders, '/books', {
    title: `Nhu cầu bổ sung ${suffix}`, authorIds: [], categoryIds: [],
  });
  const edition = await createCatalog(request, staffHeaders, `/books/${book.id}/editions`, {});
  const branch = await createCatalog(request, staffHeaders, '/branches', {
    code: `A-${suffix}`, name: `Chi nhánh đề xuất ${suffix}`,
  });
  const shelf = await createCatalog(request, staffHeaders, '/shelves', {
    branchId: branch.id, code: 'A1', label: 'Kệ đề xuất', sortOrder: 0,
  });
  const copy = await createCatalog(request, staffHeaders, '/copies', {
    editionId: edition.id, shelfId: shelf.id, barcode: `A-${suffix}`,
  });
  const ready = await request.post(`${core}/copies/${copy.id}/state`, { headers: staffHeaders,
    data: { requestId: randomUUID(), version: copy.version, status: 'AVAILABLE', reason: 'Đã kiểm tra bản sách thử' } });
  expect(ready.status()).toBe(200);

  const readerLogin = await request.post(`${core}/auth/login`, { data: {
    identifier: accounts.READER.email, password, remember: false,
  } });
  expect(readerLogin.status()).toBe(200);
  const reader = await readerLogin.json();
  const borrowed = await createCatalog(request, staffHeaders, '/loans', {
    requestId: randomUUID(), copyId: copy.id, readerId: reader.user.id, branchId: branch.id,
    copyVersion: (await ready.json()).version,
  });
  const waitingReader = await request.post(`${core}/auth/register`, { data: {
    fullName: `Bạn đọc chờ ${suffix}`, email: `acquisition-${suffix}@example.test`, password,
  } });
  expect(waitingReader.status()).toBe(201);
  const waitingLogin = await request.post(`${core}/auth/login`, { data: {
    identifier: `acquisition-${suffix}@example.test`, password, remember: false,
  } });
  expect(waitingLogin.status()).toBe(200);
  const waitingToken = String((await waitingLogin.json()).accessToken);
  const hold = await request.post(`${core}/holds`, { headers: { Authorization: `Bearer ${waitingToken}` },
    data: { requestId: randomUUID(), bookId: book.id, branchId: branch.id, editionId: edition.id, anyEdition: false } });
  expect(hold.status(), await hold.text()).toBe(201);
  expect((await hold.json()).status).toBe('WAITING');

  const from = new Date(Date.now() - 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  await expect.poll(() => Date.now() > Date.parse(borrowed.borrowedAt) + 2_000).toBe(true);
  const to = new Date(Date.now() - 1_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const scope = { bookId: book.id, branchId: branch.id, from, to };
  expect((await request.get(`${insight}/acquisition/analysis`, { params: scope })).status()).toBe(401);
  const factsResponse = await request.get(`${core}/reports/acquisition-facts`, { headers: staffHeaders, params: scope });
  expect(factsResponse.status(), await factsResponse.text()).toBe(200);
  const facts = await factsResponse.json();
  expect(facts).toMatchObject({ bookId: book.id, branchId: branch.id, copiesOwned: 1,
    copiesAvailable: 0, waitingHolds: { count: 1 }, loansStarted: { count: 1 },
    favoritesAdded: { count: null } });
  const analysis = await request.get(`${insight}/acquisition/analysis`, { headers: staffHeaders, params: scope });
  expect(analysis.status(), await analysis.text()).toBe(200);
  const result = await analysis.json();
  expect(result.snapshot).toMatchObject({ bookId: book.id, branchId: branch.id,
    waitingHolds: { count: 1 }, loansStarted: { count: 1 } });
  expect(result.score).toMatchObject({ version: 'acquisition-v1', confidence: 0.85,
    components: { waitingHolds: { contribution: 50 }, loansStarted: { contribution: 8.8 },
      favoritesAdded: { count: null, contribution: 0 } } });
  expect(result.score.score).toBe(58.8);

  await loginCatalog(page, 'LIBRARIAN');
  await navigate(page, '/nhan-vien/de-xuat-bo-sung');
  await page.getByRole('button', { name: 'Chọn sách cần phân tích' }).click();
  await page.getByRole('combobox', { name: 'Tìm trong sách cần phân tích' }).fill(book.title);
  await page.getByRole('radio', { name: book.title }).click();
  await page.getByRole('button', { name: 'Chọn chi nhánh phân tích' }).click();
  await page.getByRole('radio', { name: new RegExp(branch.name) }).click();
  const local = (value: string) => {
    const date = new Date(value);
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 19);
  };
  await page.getByLabel('Từ thời điểm').fill(local(from));
  await page.getByLabel('Đến trước thời điểm').fill(local(to));
  await page.getByRole('button', { name: 'Xem số liệu và điểm nhu cầu' }).click();
  await expect(page.getByLabel('Kết quả phân tích')).toContainText('Điểm 58.8/100');
  await expect(page.getByLabel('Kết quả phân tích')).toContainText('1 lượt mượn trong kỳ');
  for (const viewport of evidenceViewports) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (viewport.width === 390) {
      const audit = await new AxeBuilder({ page }).include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(audit.violations).toEqual([]);
    }
    await captureFullPage(page, { path: `test-results/acquisition-analysis-${viewport.width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Lưu đề xuất chờ duyệt' }).click();
  await expect(page.getByLabel('Chi tiết đề xuất')).toContainText('Chờ duyệt');

  const list = await request.get(`${insight}/acquisition/recommendations?state=DRAFT`, { headers: staffHeaders });
  expect(list.status()).toBe(200);
  const draft = (await list.json()).items.find((item: { bookId: string }) => item.bookId === book.id);
  expect(draft).toMatchObject({ state: 'DRAFT', version: 0, bookId: book.id,
    evidence: { waitingHolds: { count: 1 }, loansStarted: { count: 1 },
      favoritesAdded: { count: null }, purchaseDecisionAllowed: false } });
  const dbRow = execFileSync('docker', ['exec', container!, 'psql', '-U', 'lams', '-d', 'lams_insight_test',
    '-t', '-A', '-c', `SELECT state || ':' || version FROM acquisition_recommendations WHERE id='${draft.id}'`],
  { encoding: 'utf8' }).trim();
  expect(dbRow).toBe('DRAFT:0');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Xem bằng chứng' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Xem bằng chứng' }).first().click();
  await expect(page.getByLabel('Chi tiết đề xuất')).toContainText('58.8/100');
  await page.getByLabel('Lý do quyết định').fill('Đã đối chiếu số bản, lượt mượn và hàng chờ.');
  await page.getByRole('button', { name: 'Duyệt nội bộ' }).click();
  await expect(page.getByLabel('Chi tiết đề xuất')).toContainText('Đã duyệt nội bộ');
  await captureFullPage(page, { path: 'test-results/acquisition-approved-1440.png', fullPage: true });
  const approved = await request.get(`${insight}/acquisition/recommendations/${draft.id}`, { headers: staffHeaders });
  expect((await approved.json())).toMatchObject({ state: 'APPROVED', version: 1,
    decisions: [{ action: 'APPROVED', version: 1 }] });
  expect((await request.post(`${insight}/acquisition/recommendations/${draft.id}/decision`, { headers: staffHeaders,
    data: { action: 'REJECTED', reason: 'Không đủ căn cứ sau khi duyệt.', expectedVersion: 0 } })).status()).toBe(409);
  const auditCount = execFileSync('docker', ['exec', container!, 'psql', '-U', 'lams', '-d', 'lams_insight_test',
    '-t', '-A', '-c', `SELECT count(*) FROM acquisition_decisions WHERE recommendation_id='${draft.id}'`],
  { encoding: 'utf8' }).trim();
  expect(auditCount).toBe('1');
  const csv = await request.get(`${insight}/acquisition/recommendations.csv?state=APPROVED`, { headers: staffHeaders });
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain(draft.id);
  const secondScope = { ...scope, from: new Date(Date.parse(from) + 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z') };
  const rejectedDraft = await request.post(`${insight}/acquisition/recommendations`,
    { headers: staffHeaders, data: secondScope });
  expect(rejectedDraft.status(), await rejectedDraft.text()).toBe(201);
  const rejectedId = (await rejectedDraft.json()).id as string;
  const rejection = await request.post(`${insight}/acquisition/recommendations/${rejectedId}/decision`, {
    headers: staffHeaders, data: { action: 'REJECTED', reason: 'Cần kiểm tra thêm nhu cầu tại chi nhánh.', expectedVersion: 0 },
  });
  expect(rejection.status()).toBe(201);
  expect((await rejection.json())).toMatchObject({ state: 'REJECTED', version: 1,
    decisions: [{ action: 'REJECTED', version: 1 }] });
  const thirdScope = { ...scope, from: new Date(Date.parse(from) + 120_000).toISOString().replace(/\.\d{3}Z$/, 'Z') };
  const competingDraft = await request.post(`${insight}/acquisition/recommendations`,
    { headers: staffHeaders, data: thirdScope });
  expect(competingDraft.status(), await competingDraft.text()).toBe(201);
  const competingId = (await competingDraft.json()).id as string;
  const adminLogin = await request.post(`${core}/auth/login`, { data: {
    identifier: accounts.ADMIN.email, password, remember: false,
  } });
  expect(adminLogin.status()).toBe(200);
  const adminHeaders = { Authorization: `Bearer ${String((await adminLogin.json()).accessToken)}` };
  const decisions = await Promise.all([
    request.post(`${insight}/acquisition/recommendations/${competingId}/decision`, { headers: staffHeaders,
      data: { action: 'APPROVED', reason: 'Đã đối chiếu đủ số liệu đề xuất.', expectedVersion: 0 } }),
    request.post(`${insight}/acquisition/recommendations/${competingId}/decision`, { headers: adminHeaders,
      data: { action: 'REJECTED', reason: 'Cần xác minh thêm tại chi nhánh.', expectedVersion: 0 } }),
  ]);
  expect(decisions.map(item => item.status()).sort()).toEqual([201, 409]);
  const competingAudit = execFileSync('docker', ['exec', container!, 'psql', '-U', 'lams', '-d', 'lams_insight_test',
    '-t', '-A', '-c', `SELECT count(*) FROM acquisition_decisions WHERE recommendation_id='${competingId}'`],
  { encoding: 'utf8' }).trim();
  expect(competingAudit).toBe('1');
  const after = await request.get(`${core}/copies/${copy.id}`, { headers: staffHeaders });
  expect((await after.json()).status).toBe('ON_LOAN');
});

test('Tìm kiếm chung, thư viện cá nhân và điều hướng sidebar', async ({ page, request }) => {
  test.setTimeout(120_000);
  const headers = await staffApi(request);
  const author = await createCatalog(request, headers, '/authors', { name: `Tác giả Premium ${suffix}` });
  const category = await createCatalog(request, headers, '/categories', { name: `Thể loại Premium ${suffix}` });
  const book = await createCatalog(request, headers, '/books', {
    title: `Tác phẩm Premium ${suffix}`, authorIds: [author.id], categoryIds: [category.id],
  });
  await loginCatalog(page, 'READER');
  await navigate(page, '/sach');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const backToTop = page.getByRole('button', { name: 'Quay về đầu trang' });
  await expect(backToTop).toBeVisible();
  expect(await page.locator('.library-topbar').evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await backToTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const search = page.getByRole('combobox', { name: 'Tìm sách, tác giả và thể loại' });
  await search.fill(`Premium ${suffix}`);
  const suggestions = page.getByRole('listbox', { name: 'Gợi ý tìm kiếm' });
  await expect(suggestions.getByRole('option').filter({ hasText: book.title })).toBeVisible();
  await search.press('ArrowDown');
  await expect(search).toHaveAttribute('aria-activedescendant', /global-search-option-/);
  await search.press('Escape');
  await page.keyboard.press('Control+k');
  await suggestions.getByRole('option').filter({ hasText: book.title }).click();
  await expect(page).toHaveURL(new RegExp(`/sach/${book.id}$`));
  await expect(page.getByRole('heading', { name: book.title })).toBeVisible();
  await page.getByRole('button', { name: 'Lưu yêu thích', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Bỏ yêu thích' })).toBeVisible();

  await navigate(page, '/sach');
  await search.fill(`Premium ${suffix}`);
  const authorSuggestion = suggestions.locator(`a[href$="/tac-gia/${author.id}"]`);
  await expect(authorSuggestion).toBeVisible();
  await authorSuggestion.click();
  await expect(page).toHaveURL(new RegExp(`/tac-gia/${author.id}$`));
  await navigate(page, '/sach');
  await search.fill(`Premium ${suffix}`);
  const categorySuggestion = suggestions.locator(`a[href$="/the-loai/${category.id}"]`);
  await expect(categorySuggestion).toBeVisible();
  await categorySuggestion.click();
  await expect(page).toHaveURL(new RegExp(`/the-loai/${category.id}$`));

  await navigate(page, '/thu-vien-cua-toi#sach-yeu-thich');
  await expect(page.getByRole('link', { name: `Xem sách ${book.title}` })).toBeVisible();
  const desktopSidebar = page.locator('.library-sidebar-desktop');
  await desktopSidebar.getByRole('button', { name: 'Thu gọn thanh điều hướng' }).click();
  await expect(desktopSidebar).toHaveClass(/is-collapsed/);
  await page.getByRole('link', { name: /Đánh giá của tôi/ }).first().click();
  await expect(page).toHaveURL(/#danh-gia$/);
  await expect(desktopSidebar.locator('.library-nav-active')).toHaveCount(1);
  await page.reload();
  await expect(desktopSidebar.locator('.library-nav-active')).toHaveCount(1);
});

test('Hồ sơ lưu thay đổi, xử lý email theo cấu hình và đổi mật khẩu thu hồi phiên', async ({ page, request }) => {
  test.setTimeout(90_000);
  const email = `account-${randomUUID()}@example.test`;
  let loginEmail = email;
  const updatedPassword = `Updated-${randomUUID()}`;
  const created = await request.post(`${core}/auth/register`, { data: {
    fullName: 'Người đọc đổi hồ sơ', email, password,
  } });
  expect(created.status()).toBe(201);
  const login = await request.post(`${core}/auth/login`, { data: { identifier: email, password } });
  expect(login.status()).toBe(200);
  const loggedIn = await login.json();
  const oldAccess = String(loggedIn.accessToken);
  const accountResponse = await request.get(`${core}/me/account`, { headers: { Authorization: `Bearer ${oldAccess}` } });
  expect(accountResponse.status()).toBe(200);
  const { emailVerificationEnabled } = await accountResponse.json() as { emailVerificationEnabled: boolean };

  await navigate(page, '/dang-nhap');
  await page.getByLabel('Email hoặc mã thành viên').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await navigate(page, '/ho-so');
  const personal = page.getByRole('region', { name: 'Thông tin cá nhân' });
  await personal.getByLabel('Họ và tên').fill('Người đọc cập nhật');
  await personal.getByLabel('Số điện thoại').fill('+84987654321');
  await personal.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await expect(page.getByText('Đã cập nhật thông tin cá nhân.')).toBeVisible();
  await page.reload();
  await expect(personal.getByLabel('Họ và tên')).toHaveValue('Người đọc cập nhật');
  await expect(personal.getByLabel('Số điện thoại')).toHaveValue('+84987654321');

  const emailPanel = page.getByRole('region', { name: 'Địa chỉ email' });
  if (emailVerificationEnabled) {
    await emailPanel.getByLabel('Email mới').fill(`new-${email}`);
    await emailPanel.getByLabel('Mật khẩu hiện tại').fill(password);
    await emailPanel.getByRole('button', { name: 'Gửi mã xác minh' }).click();
    await expect(emailPanel.getByText(`new-${email}`, { exact: true })).toBeVisible();
    await expect(emailPanel.getByText(email, { exact: true })).toBeVisible();
    await emailPanel.getByRole('button', { name: 'Hủy yêu cầu' }).click();
    await expect(emailPanel.getByText(`new-${email}`, { exact: true })).not.toBeVisible();
    const mailpitUrl = process.env.LAMS_E2E_MAILPIT_URL;
    if (mailpitUrl) {
      const address = new URL(mailpitUrl);
      if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1') throw new Error('Mailpit kiểm thử phải ở loopback.');
      const userId = String(loggedIn.user.id);
      if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Định danh fixture không hợp lệ.');
      // Only the owner-checked disposable PostgreSQL fixture is advanced; production policy stays unchanged.
      const advanceFixture = (field: 'pending_email_requested_at' | 'pending_email_expires_at') => {
        execFileSync('docker', ['exec', container!, 'psql', '-U', 'lams', '-d', 'lams_core', '-v', 'ON_ERROR_STOP=1',
          '-c', `UPDATE users SET ${field}=now()-interval '2 minutes' WHERE id='${userId}'`], { stdio: 'pipe' });
      };
      const readCode = async (recipient: string) => {
        let mailId = '';
        await expect.poll(async () => {
          const response = await request.get(`${mailpitUrl}/api/v1/messages`);
          if (!response.ok()) return false;
          const data = await response.json() as { messages: { ID: string; To: { Address: string }[] }[] };
          mailId = data.messages.find(message => message.To.some(to => to.Address === recipient))?.ID ?? '';
          return !!mailId;
        }).toBe(true);
        const message = await request.get(`${mailpitUrl}/api/v1/message/${mailId}`);
        const text = String((await message.json()).Text);
        const code = /Mã xác minh đổi email của bạn: ([A-Z0-9]{12})/.exec(text)?.[1];
        if (!code) throw new Error('Mailpit chưa có mã đúng định dạng; không ghi nội dung thư vào log.');
        return code;
      };
      const sendCode = async (recipient: string) => {
        await emailPanel.getByLabel('Email mới').fill(recipient);
        await emailPanel.getByLabel('Mật khẩu hiện tại').fill(password);
        await emailPanel.getByRole('button', { name: 'Gửi mã xác minh' }).click();
        await expect(emailPanel.getByText(recipient, { exact: true })).toBeVisible();
        return readCode(recipient);
      };
      const headers = { Authorization: `Bearer ${oldAccess}` };
      const attemptCode = await sendCode(`attempt-${email}`);
      const wrongCode = (attemptCode[0] === 'A' ? 'B' : 'A') + attemptCode.slice(1);
      await emailPanel.getByLabel('Mã xác minh').fill(wrongCode);
      await emailPanel.getByRole('button', { name: 'Xác minh email' }).click();
      await expect(emailPanel.getByRole('alert')).toContainText('Mã không hợp lệ');
      for (let attempt = 1; attempt < 5; attempt++) {
        expect((await request.post(`${core}/me/account/email-confirm`, { headers, data: { code: wrongCode } })).status()).toBe(422);
      }
      expect((await request.post(`${core}/me/account/email-confirm`, { headers, data: { code: attemptCode } })).status()).toBe(422);
      expect((await request.post(`${core}/me/account/email-request`, { headers, data: { currentPassword: password, email: `cooldown-${email}` } })).status()).toBe(429);
      advanceFixture('pending_email_requested_at');
      const expiredCode = await sendCode(`expired-${email}`);
      advanceFixture('pending_email_expires_at');
      await emailPanel.getByLabel('Mã xác minh').fill(expiredCode);
      const expired = page.waitForResponse(response => response.url().endsWith('/me/account/email-confirm') && response.request().method() === 'POST');
      await emailPanel.getByRole('button', { name: 'Xác minh email' }).click();
      expect((await expired).status()).toBe(422);
      advanceFixture('pending_email_requested_at');
      // Concurrent requests share the account lock: exactly one delivery may win the cooldown.
      const race = await Promise.all(['race-a', 'race-b'].map(prefix => request.post(`${core}/me/account/email-request`, {
        headers, data: { currentPassword: password, email: `${prefix}-${email}` },
      })));
      expect(race.map(response => response.status()).sort()).toEqual([200, 429]);
      advanceFixture('pending_email_requested_at');
      loginEmail = `verified-${email}`;
      const verifiedCode = await sendCode(loginEmail);
      advanceFixture('pending_email_requested_at');
      expect((await request.post(`${core}/me/account/email-request`, { headers, data: { currentPassword: password, email: `quota-${email}` } })).status()).toBe(429);
      await emailPanel.getByLabel('Mã xác minh').fill(verifiedCode);
      await emailPanel.getByRole('button', { name: 'Xác minh email' }).click();
      await expect(page.getByLabel('Email hoặc mã thành viên')).toBeVisible();
      expect((await request.get(`${core}/auth/me`, { headers })).status()).toBe(401);
      expect((await request.post(`${core}/auth/login`, { data: { identifier: email, password } })).status()).toBe(401);
      await page.getByLabel('Email hoặc mã thành viên').fill(loginEmail);
      await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
      await navigate(page, '/ho-so');
      await expect(emailPanel.getByText(loginEmail, { exact: true })).toBeVisible();
    }
  } else {
    await expect(emailPanel.getByText(/chưa bật gửi mã xác minh/)).toBeVisible();
    await expect(emailPanel.getByLabel('Email mới')).toHaveCount(0);
  }

  const security = page.getByRole('region', { name: 'Đổi mật khẩu' });
  await security.getByLabel('Mật khẩu hiện tại').fill(password);
  await security.getByLabel('Mật khẩu mới').fill(updatedPassword);
  await security.getByRole('button', { name: 'Đổi mật khẩu' }).click();
  await expect(page.getByLabel('Email hoặc mã thành viên')).toBeVisible();
  expect((await request.get(`${core}/auth/me`, { headers: { Authorization: `Bearer ${oldAccess}` } })).status()).toBe(401);
  expect((await request.post(`${core}/auth/login`, { data: { identifier: loginEmail, password } })).status()).toBe(401);
  await page.getByLabel('Email hoặc mã thành viên').fill(loginEmail);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(updatedPassword);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await navigate(page, '/ho-so');
  await expect(personal.getByLabel('Họ và tên')).toHaveValue('Người đọc cập nhật');
  const mailpitContainer = process.env.LAMS_E2E_MAILPIT_CONTAINER;
  const mailpitOwner = process.env.LAMS_E2E_MAILPIT_OWNER;
  if (mailpitContainer && mailpitOwner) {
    const actual = execFileSync('docker', ['inspect', '--format', '{{ index .Config.Labels "lams.smtp-acceptance" }}', mailpitContainer], { encoding: 'utf8' }).trim();
    if (actual !== mailpitOwner) throw new Error('Không dừng SMTP không thuộc lượt kiểm thử.');
    const failedEmail = `smtp-failure-${randomUUID()}@example.test`;
    const failedAccount = await request.post(`${core}/auth/register`, { data: { fullName: 'Kiểm thử gián đoạn SMTP', email: failedEmail, password } });
    expect(failedAccount.status()).toBe(201);
    const headers = { Authorization: `Bearer ${(await failedAccount.json()).accessToken}` };
    try {
      execFileSync('docker', ['stop', '--time', '3', mailpitContainer], { stdio: 'pipe' });
      const response = await request.post(`${core}/me/account/email-request`, { headers,
        data: { currentPassword: password, email: `unavailable-${failedEmail}` } });
      expect(response.status()).toBe(503);
      const current = await request.get(`${core}/me/account`, { headers });
      expect(current.status()).toBe(200);
      const state = await current.json();
      expect(state.pendingEmail).toBeNull();
      expect(state.email === failedEmail).toBe(true);
    } finally { execFileSync('docker', ['start', mailpitContainer], { stdio: 'pipe' }); }
  }
});

const readinessWidths = [390, 768, 1024, 1366, 1440, 1920];
function startReadinessMeasurements() {
  const previous = (window as unknown as { __lamsReadinessObserver?: PerformanceObserver }).__lamsReadinessObserver;
  previous?.disconnect();
  performance.clearResourceTimings();
  const metrics = { supported: PerformanceObserver.supportedEntryTypes.includes('longtask'), durations: [] as number[] };
  Object.assign(window, { __lamsReadinessMetrics: metrics });
  if (metrics.supported) {
    const observer = new PerformanceObserver(list => {
      metrics.durations.push(...list.getEntries().map(entry => entry.duration));
    });
    observer.observe({ type: 'longtask' });
    Object.assign(window, { __lamsReadinessObserver: observer });
  }
}
// Opt-in only: run alone on the installed EXE, without concurrent builds or the screenshot suite.
if (process.env.LAMS_E2E_BENCHMARK === '1') {
  test('Benchmark EXE: đăng nhập và mở trang, 10 mẫu mỗi hành trình', async ({ page, request }, testInfo) => {
    test.setTimeout(240_000);
    expect(!!desktopEndpoint, 'Phép đo này chỉ dành cho EXE').toBe(true);
    const budget = { loginMs: 3000, routeMs: 2000, apiMs: 1000, longTaskMs: 200 };
    const pendingApi = new Set<import('@playwright/test').Request>();
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) pendingApi.add(request); });
    page.on('requestfinished', request => pendingApi.delete(request));
    page.on('requestfailed', request => pendingApi.delete(request));
    execFileSync('docker', ['exec', container!, 'psql', '-U', 'lams', '-d', 'lams_core', '-v', 'ON_ERROR_STOP=1', '-c',
      "INSERT INTO books(id,title,normalized_title,description) SELECT gen_random_uuid(), 'Benchmark ' || n, 'benchmark ' || n, repeat('Dữ liệu tổng hợp cho phép đo hiệu năng. ', 8) FROM generate_series(1,10000) n; ANALYZE books;"], { stdio: 'pipe' });
    const samples: { scenario: string; elapsedMs: number; longTasks: number[]; longTasksSupported: boolean; apiMs: number[] }[] = [];
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.addInitScript(startReadinessMeasurements);
    const settled = async () => {
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole('progressbar', { name: 'Đang tải dữ liệu' })).toHaveCount(0);
      await expect(page.locator('.appearance-loading')).toHaveCount(0);
      await expect.poll(() => pendingApi.size, { message: 'Các API của hành trình phải hoàn tất' }).toBe(0);
    };
    const measure = async (scenario: string, action: () => Promise<unknown>, heading: string | RegExp) => {
      await page.evaluate(startReadinessMeasurements);
      const started = performance.now();
      await action();
      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
      await settled();
      const elapsedMs = performance.now() - started;
      const details = await page.evaluate(() => ({
        longTasks: [...(window as unknown as { __lamsReadinessMetrics: { durations: number[] } }).__lamsReadinessMetrics.durations],
        longTasksSupported: (window as unknown as { __lamsReadinessMetrics: { supported: boolean } }).__lamsReadinessMetrics.supported,
        apiMs: performance.getEntriesByType('resource').filter(entry => new URL(entry.name).pathname.startsWith('/api/'))
          .map(entry => entry.duration),
      }));
      samples.push({ scenario, elapsedMs, ...details });
    };
    for (let i = 0; i < 10; i++) {
      await navigate(page, '/dang-nhap');
      await page.getByLabel('Email hoặc mã thành viên').fill(accounts.READER.email);
      await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
      await measure('reader-login', async () => {
        await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
      }, /Cuốn sách tiếp theo/);
      await navigate(page, '/ho-so'); await settled();
      await measure('reader-home', () => navigate(page, '/'), /Cuốn sách tiếp theo/);
      await measure('reader-library', () => navigate(page, '/thu-vien-cua-toi'), 'Thư viện của tôi');
      await measure('catalog', () => navigate(page, '/sach'), 'Khám phá sách');
      await measure('search', async () => {
        const response = page.waitForResponse(value => value.url().includes('/public/catalog/books?')
          && new URL(value.url()).searchParams.get('query') === `Benchmark ${i + 1}`);
        await navigate(page, `/sach?query=Benchmark%20${i + 1}&sort=relevance`);
        expect((await response).status()).toBe(200);
      }, 'Khám phá sách');
      await expect(page.locator('a[href*="/sach/"]').first()).toBeVisible();
      const detailPath = await page.locator('a[href*="/sach/"]').first().getAttribute('href');
      expect(detailPath).toBeTruthy();
      await measure('book-detail', () => page.locator(`a[href="${detailPath}"]`).first().click(), /^Benchmark \d+$/);
      await page.getByRole('button', { name: 'Đăng xuất' }).click();
      await expect(page.getByRole('button', { name: 'Đăng xuất' })).toHaveCount(0);
    }
    for (const role of ['LIBRARIAN', 'ADMIN']) {
      await loginCatalog(page, role);
      for (let i = 0; i < 10; i++) {
        await navigate(page, '/ho-so'); await settled();
        await measure(`${role.toLowerCase()}-dashboard`, () => navigate(page, '/nhan-vien/bang-dieu-khien'), role === 'ADMIN' ? 'Quản trị hệ thống' : 'Bảng điều khiển');
      }
      await page.getByRole('button', { name: 'Đăng xuất' }).click();
      await expect(page.getByRole('button', { name: 'Đăng xuất' })).toHaveCount(0);
    }
    const catalog = await request.get(`${core}/public/catalog/books?size=1`);
    expect(catalog.status()).toBe(200);
    const catalogCount = (await catalog.json()).page.totalElements;
    const summaries = Array.from(new Set(samples.map(sample => sample.scenario))).map(scenario => {
      const values = samples.filter(sample => sample.scenario === scenario).map(sample => sample.elapsedMs).sort((a, b) => a - b);
      const p95 = values[Math.ceil(0.95 * values.length) - 1];
      return { scenario, n: values.length, medianMs: (values[4] + values[5]) / 2, p95Ms: p95,
        budgetMs: scenario.endsWith('login') ? budget.loginMs : budget.routeMs };
    });
    const output = testInfo.outputPath('installed-benchmark.json');
    await writeFile(output, JSON.stringify({ recordedAt: new Date().toISOString(), budget, catalogCount,
      method: 'Warm backend and running EXE; 10000 synthetic Book rows in disposable database, no copies or reader history; hash-route navigation; login measured from submit through useful content and query settlement. Ten sequential samples, nearest-rank p95 equals max for n=10. No cold-process or production-workload claim.',
      browser: await page.evaluate(() => ({ userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency })),
      summaries, samples }, null, 2));
    await testInfo.attach('installed-benchmark', { path: output, contentType: 'application/json' });
    for (const summary of summaries) expect.soft(summary.p95Ms, summary.scenario).toBeLessThanOrEqual(summary.budgetMs);
  });
}
for (const role of ['GUEST', 'READER', 'LIBRARIAN', 'ADMIN']) {
  test(`Nghiệm thu route và responsive: ${role}`, async ({ page, request }, testInfo) => {
    test.setTimeout(360_000);
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(startReadinessMeasurements);
    const headers = await staffApi(request);
    const author = await createCatalog(request, headers, '/authors', { name: `Tác giả nghiệm thu ${role} ${suffix}` });
    const category = await createCatalog(request, headers, '/categories', { name: `Thể loại nghiệm thu ${role} ${suffix}` });
    const book = await createCatalog(request, headers, '/books', { title: `Tác phẩm nghiệm thu ${role} ${suffix}`, authorIds: [author.id], categoryIds: [category.id] });
    const publicPaths = ['/', '/sach', '/tac-gia', '/the-loai', `/sach/${book.id}`, `/tac-gia/${author.id}`, `/the-loai/${category.id}`, '/cai-dat/giao-dien'];
    const readerPaths = ['/ho-so', '/thu-vien-cua-toi', '/muon-va-giu-cho', '/thong-bao'];
    const staffPaths = ['bang-dieu-khien', 'thanh-vien', 'danh-muc', 'luu-thong', 'hop-thu', 'giu-cho', 'bao-cao-luu-thong', 'bao-cao-giu-cho', 'kiem-ke', 'de-xuat-bo-sung'].map(path => `/nhan-vien/${path}`);
    const paths = role === 'GUEST' ? [...publicPaths, '/dang-nhap', '/dang-ky', '/duong-dan-khong-ton-tai']
      : role === 'READER' ? readerPaths
        : role === 'LIBRARIAN' ? staffPaths : [...staffPaths, '/nhan-vien/tai-khoan', '/nhan-vien/bao-cao-danh-gia'];
    if (role !== 'GUEST') await loginCatalog(page, role);
    const inventory: unknown[] = [];
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      await page.evaluate(startReadinessMeasurements);
      const started = performance.now();
      await navigate(page, path);
      await expect(page.getByRole('heading', { level: 1 }).first(), path).toBeVisible();
      await expect(page.getByRole('progressbar', { name: 'Đang tải dữ liệu' })).toHaveCount(0);
      const settledMs = Math.round(performance.now() - started);
      // Lấy mốc trước khi chụp ảnh/chạy axe để không tính chi phí công cụ vào thao tác mở trang.
      const runtime = await page.evaluate(() => ({
        longTasks: (window as unknown as { __lamsReadinessMetrics: { supported: boolean; durations: number[] } }).__lamsReadinessMetrics,
        resources: performance.getEntriesByType('resource').map(entry => {
          const resource = entry as PerformanceResourceTiming;
          return { path: new URL(resource.name).pathname, initiator: resource.initiatorType, duration: resource.duration, transferSize: resource.transferSize };
        }),
      }));
      for (const width of readinessWidths) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth), { message: `${role} ${path} ${width}px` }).toBeLessThanOrEqual(1);
        await captureFullPage(page, { path: testInfo.outputPath(`route-${index}-${width}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 900 });
      const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect.soft(audit.violations, `${role} ${path}`).toEqual([]);
      // Kiểm reflow ở độ phóng đại CSS 200%; không thay thế kiểm zoom native bằng tay.
      await page.setViewportSize({ width: 1366, height: 900 });
      try {
        await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
          { message: `${role} ${path} CSS zoom 200%` }).toBeLessThanOrEqual(1);
        await captureFullPage(page, { path: testInfo.outputPath(`route-${index}-css-zoom-200.png`), fullPage: true });
      } finally { await page.evaluate(() => { document.documentElement.style.zoom = ''; }); }
      inventory.push({ path, role, settledMs, runtime, actions: await page.locator('button,a,input,select,textarea').evaluateAll(elements => elements.map(element => ({
        tag: element.tagName, text: element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 160),
        href: element.getAttribute('href'), disabled: element.matches(':disabled'), visible: element.getClientRects().length > 0,
      }))), accessibilityViolations: audit.violations });
    }
    const inventoryPath = testInfo.outputPath('route-inventory.json');
    await writeFile(inventoryPath, JSON.stringify(inventory, null, 2));
    await testInfo.attach('route-inventory', { path: inventoryPath, contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
}

test('Đăng xuất về muộn không đóng trang đăng nhập vừa mở', async ({ page }) => {
  await loginCatalog(page, 'READER');
  let releaseLogout!: () => void;
  await page.route('**/auth/logout', async route => {
    await new Promise<void>(resolve => { releaseLogout = resolve; });
    await route.continue();
  });
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect.poll(() => typeof releaseLogout).toBe('function');
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toHaveCount(0);
  // Dùng liên kết SPA: page.goto trên Web sẽ unload và hủy request đang giữ.
  await page.getByRole('link', { name: 'Đăng nhập', exact: true }).filter({ visible: true }).first().click();
  await page.getByLabel('Email hoặc mã thành viên').fill(accounts.READER.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  const response = page.waitForResponse(value => value.url().endsWith('/auth/logout'));
  releaseLogout();
  expect((await response).status()).toBe(204);
  await expect(page.getByLabel('Email hoặc mã thành viên')).toHaveValue(accounts.READER.email);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click({ timeout: 5000 });
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toBeVisible();
});

test('Nghiệm thu phục hồi: đăng nhập giữ đường quay lại và đăng xuất khi mất mạng', async ({ page }) => {
  await navigate(page, '/muon-va-giu-cho?holdPage=2#holds');
  await expect(page.getByRole('heading', { name: 'Chào mừng bạn quay lại' })).toBeVisible();
  await page.getByLabel('Email hoặc mã thành viên').fill(accounts.READER.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page).toHaveURL(/muon-va-giu-cho\?holdPage=2#holds$/);
  await expect(page.getByRole('heading', { name: 'Mượn và giữ chỗ', exact: true })).toBeVisible();
  await page.route('**/auth/logout', route => route.abort('failed'));
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'chưa xác nhận thu hồi phiên' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Thử đóng phiên lại' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toHaveCount(0);
  await page.unroute('**/auth/logout');
  await page.getByRole('button', { name: 'Thử đóng phiên lại' }).click();
  await expect(page.getByText(/chưa xác nhận thu hồi phiên/)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Đăng xuất', exact: true })).toHaveCount(0);
});
