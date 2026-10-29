import { test as base, expect, chromium, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

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
      await providePage(nativePage);
    } finally { await desktop.close(); }
  },
});
async function navigate(page: Page, path: string) {
  await page.goto(desktopEndpoint ? `http://tauri.localhost/#${path}` : path);
}

async function captureFullPage(page: Page, options: Parameters<Page['screenshot']>[0]) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ ...options, animations: 'disabled' });
}

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
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
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
  await expect(page.getByText('Chưa có sách yêu thích ở trang này.')).toBeVisible();
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
  await expect(page.getByText('Chưa có sách yêu thích ở trang này.')).toBeVisible();
  await expect(page.getByText('Bạn chưa có đánh giá ở trang này.')).toBeVisible();
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
  const select=page.getByLabel('Loại dữ liệu');
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
  await page.getByLabel('Loại dữ liệu').selectOption('editions');await page.getByRole('button',{name:'Chọn tác phẩm',exact:true}).click();
  await page.getByRole('radio',{name:`A0 Book ${suffix}`}).click();await page.getByRole('button',{name:'Thêm ấn bản'}).click();
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

test('Phase 4 Reader: giữ đúng ấn bản, nhận sách, gia hạn và hủy hàng chờ trên dữ liệu thật', async ({ page, request }) => {
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
  await captureFullPage(page, { path: 'test-results/book-detail-glass.png', fullPage: true });
  await page.getByRole('link', { name: 'Giữ chỗ ấn bản này' }).click();
  await expect(page.getByRole('checkbox')).not.toBeChecked();
  await page.getByRole('button', { name: 'Chọn chi nhánh nhận' }).click();
  await page.getByRole('radio', { name: new RegExp(`Nhận sách ${suffix}`) }).click();
  await expect(page.getByText(`Đã chọn: ${branch.code} · ${branch.name}`)).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận giữ chỗ' }).click();
  await expect(page.getByRole('status')).toContainText('Sẵn sàng nhận');
  await page.getByRole('link', { name: 'Xem các lượt mượn và giữ chỗ của tôi' }).click();
  await page.reload(); await expect(page.getByLabel('Giữ chỗ của tôi')).toContainText('Sẵn sàng nhận');
  const ready = await request.get(`${core}/copies/${copy.id}`, { headers }); expect(ready.status()).toBe(200);
  const borrowed = await createCatalog(request, headers, '/loans', { requestId: randomUUID(), copyId: copy.id,
    readerId: reader.user.id, branchId: branch.id, copyVersion: (await ready.json()).version });
  await page.reload();
  const loans = page.getByLabel('Lượt mượn của tôi');
  await expect(loans).toContainText(book.title); await expect(page.getByLabel('Giữ chỗ của tôi')).toContainText('Đã nhận sách');
  await loans.getByRole('button', { name: 'Gia hạn', exact: true }).click();
  await loans.getByRole('button', { name: 'Xác nhận gia hạn' }).click();
  await expect(loans).toContainText('Đã gia hạn 1 lần');
  const renewed = await request.get(`${core}/loans/${borrowed.loanId}`, { headers: readerHeaders });
  expect(renewed.status()).toBe(200); const renewedBody = await renewed.json();
  expect(renewedBody.renewalCount).toBe(1); expect(Date.parse(renewedBody.dueAt)).toBeGreaterThan(Date.parse(borrowed.dueAt));
  await navigate(page, `/giu-cho/${book.id}/${edition.id}`);
  await page.getByRole('button', { name: 'Chọn chi nhánh nhận' }).click();
  await page.getByRole('radio', { name: new RegExp(`Nhận sách ${suffix}`) }).click();
  await expect(page.getByText(`Đã chọn: ${branch.code} · ${branch.name}`)).toBeVisible();
  await page.getByRole('button', { name: 'Xác nhận giữ chỗ' }).click();
  await expect(page.getByRole('status')).toContainText('Đang chờ');
  await page.getByRole('link', { name: 'Xem các lượt mượn và giữ chỗ của tôi' }).click();
  await page.getByRole('button', { name: 'Xem thời gian dự kiến' }).click();
  await expect(page.getByLabel('Ước tính giữ chỗ')).toContainText('chưa phải thông báo đến nhận');
  const waiting = await request.get(`${core}/me/holds?size=100`, { headers: readerHeaders }); expect(waiting.status()).toBe(200);
  const waitingHold = (await waiting.json()).items.find((item: { hold: { status: string } }) => item.hold.status === 'WAITING').hold;
  const estimate = await request.get(`${core}/holds/${waitingHold.id}/estimate`, { headers: readerHeaders }); expect(estimate.status()).toBe(200);
  const eta = await estimate.json(); expect(eta.reason).toBe('CONDITIONAL'); expect(Date.parse(eta.estimatedAt)).toBe(Date.parse(renewedBody.dueAt));
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/hold-eta-${viewport.width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Hủy giữ chỗ', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận hủy giữ chỗ' }).click();
  await expect(page.getByLabel('Giữ chỗ của tôi')).toContainText('Đã hủy');
  await page.reload(); await expect(page.getByLabel('Giữ chỗ của tôi')).toContainText('Đã hủy');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/reader-circulation-${viewport.width}.png`, fullPage: true });
  }
  expect((await request.post(`${core}/loans/${borrowed.loanId}/return`, { headers, data: { requestId: randomUUID(), version: renewedBody.version, branchId: branch.id } })).status()).toBe(200);
  await page.reload(); await expect(loans).toContainText('Đã trả');
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
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
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
  await page.getByRole('button',{name:'Hủy chỉnh sửa'}).click();await expect(page.getByRole('row').filter({hasText:`UPDATED-${suffix}`})).toBeVisible();
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
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await captureFullPage(page, { path: `test-results/inventory-${width}.png`, fullPage: true });
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
  await captureFullPage(page, { path: 'test-results/acquisition-analysis-1440.png', fullPage: true });
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
  const updatedPassword = `Updated-${randomUUID()}`;
  const created = await request.post(`${core}/auth/register`, { data: {
    fullName: 'Người đọc đổi hồ sơ', email, password,
  } });
  expect(created.status()).toBe(201);
  const login = await request.post(`${core}/auth/login`, { data: { identifier: email, password } });
  expect(login.status()).toBe(200);
  const oldAccess = String((await login.json()).accessToken);
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
  expect((await request.post(`${core}/auth/login`, { data: { identifier: email, password } })).status()).toBe(401);
  await page.getByLabel('Email hoặc mã thành viên').fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(updatedPassword);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await navigate(page, '/ho-so');
  await expect(personal.getByLabel('Họ và tên')).toHaveValue('Người đọc cập nhật');
});
