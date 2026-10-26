import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./demo-catalog.mjs', import.meta.url));

test('khóa thể loại demo khớp quy tắc resolver và seed có thể chạy lại', () => {
  const sql = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.match(sql, /'Thám tử','thám tử'\) ON CONFLICT\(id\) DO UPDATE SET normalized_alias=/u);
  assert.match(sql, /'Trinh thám','trinh thám'\) ON CONFLICT\(id\) DO UPDATE SET normalized_name=/u);
  assert.match(sql, /'Khoa học giả tưởng','khoa học giả tưởng'\) ON CONFLICT\(id\) DO UPDATE SET normalized_alias=/u);
  assert.match(sql, /RAISE EXCEPTION 'Bí danh demo đã trỏ tới thể loại khác\.'/u);
  assert.match(sql, /^BEGIN;/u);
  assert.match(sql, /^COMMIT;$/mu);
  assert.doesNotMatch(sql, /INSERT INTO editions\([^)]*isbn/iu);
});
