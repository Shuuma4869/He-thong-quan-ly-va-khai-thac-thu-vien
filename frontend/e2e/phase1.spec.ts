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
    await page.screenshot({path:`test-results/history-${viewport.width}.png`,fullPage:true});
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
  await expect(page.getByText(/Chưa có thông tin hồ sơ bổ sung/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(address, { exact: true })).toBeVisible();
  const refreshCookie = (await page.context().cookies()).find(cookie => cookie.name === 'lams_refresh');
  expect(refreshCookie?.httpOnly).toBe(true);
  expect(refreshCookie?.sameSite).toBe('Lax');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/profile-mobile.png', fullPage: true });
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
    await page.screenshot({ path: `test-results/members-${role.toLowerCase()}.png`, fullPage: true });
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
  await navigate(page,`/sach/${book.id}`);await expect(page.getByLabel('Chưa có bìa đã xác minh')).toBeVisible();
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
  await expect(page.getByLabel('Điểm trung bình')).toHaveText('1.00/5 · 1 đánh giá');
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
  await expect(page.getByLabel('Điểm trung bình')).toHaveText('5.00/5 · 1 đánh giá');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/reviews-${viewport.width}.png`, fullPage: true });
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
  await expect(page.getByRole('link', { name: book.title, exact: true })).toBeVisible();
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
  await expect(page.getByLabel('Điểm trung bình')).toHaveText('Chưa có điểm đánh giá.');
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
  await navigate(page,`/sach?query=${suffix}&authorId=${author.id}&categoryId=${category.id}&size=1&page=0`);
  await expect(page.getByRole('link',{name:`Catalog ${suffix}`,exact:true})).toBeVisible();
  await expect(page.getByText('Trang 1 / 2 · 2 kết quả')).toBeVisible();
  await page.getByRole('button',{name:'Trang sau'}).click();await expect(page).toHaveURL(/page=1/);
  await page.reload(); await expect(page.getByRole('link',{name:`Catalog ${suffix} second`,exact:true})).toBeVisible();
  await page.goBack();await expect(page.getByText('Trang 1 / 2 · 2 kết quả')).toBeVisible();
  await page.getByRole('link',{name:`Catalog ${suffix}`,exact:true}).click();
  await expect(page.getByText('ISBN 9780140328721')).toBeVisible();await expect(page.getByText('Ấn bản không có ISBN')).toBeVisible();
  await page.getByRole('link',{name:`Author ${suffix}`,exact:true}).click();
  await expect(page.getByRole('heading',{name:`Author ${suffix}`})).toBeVisible();
  await expect(page.getByRole('link',{name:`Catalog ${suffix}`,exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/catalog-author-mobile.png',fullPage:true});
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
    await page.screenshot({ path: `test-results/hold-eta-${viewport.width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Hủy giữ chỗ', exact: true }).click();
  await page.getByRole('button', { name: 'Xác nhận hủy giữ chỗ' }).click();
  await expect(page.getByLabel('Giữ chỗ của tôi')).toContainText('Đã hủy');
  await page.reload(); await expect(page.getByLabel('Giữ chỗ của tôi')).toContainText('Đã hủy');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/reader-circulation-${viewport.width}.png`, fullPage: true });
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
    await page.screenshot({ path: `test-results/staff-circulation-${viewport.width}.png`, fullPage: true });
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
  await page.reload(); await expect(page.getByRole('heading', { name: 'Báo cáo mượn theo chi nhánh' })).toBeVisible();
  if (desktopEndpoint) expect(await page.evaluate(() => '__TAURI_INTERNALS__' in window)).toBe(true);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/circulation-report-${viewport.width}.png`, fullPage: true });
  }
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
  await page.screenshot({path:'test-results/catalog-staff-copy.png',fullPage:true});
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
    await page.screenshot({ path: `test-results/inventory-${width}.png`, fullPage: true });
  }
  if (desktopEndpoint) expect(await page.evaluate(() => '__TAURI_INTERNALS__' in window)).toBe(true);
});

test('Phase 6 tìm sách: không dấu, xếp hạng, tác giả, ISBN và trang ổn định', async ({ page, request }) => {
  const headers = await staffApi(request);
  const author = await createCatalog(request, headers, '/authors', { name: `Nguyễn Bình ${suffix}` });
  const exact = await createCatalog(request, headers, '/books', {
    title: `Đường về ${suffix}`, description: 'Một câu chuyện', authorIds: [], categoryIds: [],
  });
  const prefix = await createCatalog(request, headers, '/books', {
    title: `Đường về ${suffix} nhà`, authorIds: [], categoryIds: [],
  });
  const byAuthor = await createCatalog(request, headers, '/books', {
    title: `Tập truyện ${suffix}`, authorIds: [author.id], categoryIds: [],
  });
  await createCatalog(request, headers, `/books/${prefix.id}/editions`, { isbn13: '9780140328721' });
  await navigate(page, `/sach?query=duong%20ve%20${suffix}&sort=relevance&size=1`);
  await expect(page.getByRole('link', { name: `Xem sách ${exact.title}` })).toBeVisible();
  await expect(page.getByText(/Trang 1 \/ \d+ · \d+ kết quả/)).toBeVisible();
  await page.getByRole('button', { name: 'Trang sau' }).click();
  await expect(page.getByRole('link', { name: `Xem sách ${prefix.title}` })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: `Xem sách ${prefix.title}` })).toBeVisible();
  const authorSearch = await request.get(`${core}/public/catalog/books`, {
    params: { query: `nguyen binh ${suffix}`, sort: 'relevance' },
  });
  expect(authorSearch.status()).toBe(200);
  expect((await authorSearch.json()).items[0].id).toBe(byAuthor.id);
  const isbnSearch = await request.get(`${core}/public/catalog/books`, {
    params: { query: '9780140328721', sort: 'relevance' },
  });
  expect(isbnSearch.status()).toBe(200);
  expect((await isbnSearch.json()).items[0].id).toBe(prefix.id);
});

test('Landing và Catalog công khai: tìm sách thật, menu mobile và bốn mốc responsive', async ({ page, request }) => {
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
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/landing-${width}.png`, fullPage: true });
  }
  await page.getByPlaceholder('Bạn muốn đọc gì?').fill(suffix);
  await page.getByRole('button', { name: 'Tìm sách' }).click();
  await expect(page).toHaveURL(new RegExp(`/sach\\?query=${suffix}`));
  await expect(page.getByRole('heading', { name: 'Khám phá sách' })).toBeVisible();
  await expect(page.getByRole('link', { name: `Xem sách ${book.title}` })).toBeVisible();
  for (const width of [390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/catalog-${width}.png`, fullPage: true });
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
