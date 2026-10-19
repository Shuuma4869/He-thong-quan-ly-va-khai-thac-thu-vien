import { test as base, expect, chromium, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const desktopEndpoint = process.env.LAMS_E2E_DESKTOP_CDP;
const test = base.extend({
  page: async ({ page }, providePage) => {
    if (!desktopEndpoint) { await providePage(page); return; }
    const desktop = await chromium.connectOverCDP(desktopEndpoint);
    try {
      const context = desktop.contexts()[0];
      await context.clearCookies();
      const nativePage = context.pages()[0];
      if (!nativePage) throw new Error('Cửa sổ WebView2 chưa mở.');
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

test('Reader đăng ký, đọc profile, bị chặn staff và đăng xuất', async ({ page }) => {
  const address = `reader-browser-${suffix}@example.test`;
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate(page, '/dang-ky');
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
    await page.getByRole('link', { name: 'Hồ sơ của tôi', exact: true }).filter({ visible: true }).click();
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
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
}

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
