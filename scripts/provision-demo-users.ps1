param([string]$CoreApiUrl = 'http://127.0.0.1:8080/api/v1')
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$root = Get-LamsRoot
Import-LamsEnv (Join-Path $root '.env') -OverrideExisting
Test-LamsLocalConfiguration
if ($env:COMPOSE_PROJECT_NAME -ne 'lams' -or
    $env:CORE_DATABASE_URL -notmatch '^jdbc:postgresql://(localhost|127\.0\.0\.1):15432/lams_core(?:\?|$)' -or
    $CoreApiUrl -notmatch '^http://(localhost|127\.0\.0\.1):8080/api/v1$') {
    throw 'Công cụ chỉ chạy với database LAMS local trên 127.0.0.1:15432; production bị chặn.'
}
if ((Read-Host 'Đây là database local/demo. Gõ DEMO để tiếp tục') -cne 'DEMO') {
    throw 'Đã hủy, không thay đổi tài khoản.'
}

$accounts = @(
    @{ Email = 'reader.demo@lams.test'; Name = 'Bạn đọc demo'; Role = 'READER' },
    @{ Email = 'librarian.demo@lams.test'; Name = 'Thủ thư demo'; Role = 'LIBRARIAN' },
    @{ Email = 'admin.demo@lams.test'; Name = 'Quản trị demo'; Role = 'ADMIN' }
)

function Invoke-DemoSql([string]$Statement) {
    $output = & docker compose exec -T postgres psql -U $env:POSTGRES_USER -d lams_core -v ON_ERROR_STOP=1 -tA -c $Statement
    if ($LASTEXITCODE -ne 0) { throw 'Truy vấn PostgreSQL demo thất bại.' }
    return @($output | Where-Object { $_ -ne '' })
}

Push-Location $root
try {
    foreach ($account in $accounts) {
        $email = $account.Email
        $role = $account.Role
        $existing = @(Invoke-DemoSql "SELECT u.id::text || '|' || string_agg(r.role_code, ',' ORDER BY r.role_code) FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.email_normalized='$email' GROUP BY u.id;")
        if ($existing.Count -gt 1) { throw "Có nhiều bản ghi cho $email; dừng để kiểm tra." }
        if ($existing.Count -eq 1 -and $existing[0].Split('|')[1] -cne $role) {
            throw "Tài khoản $email đã có vai trò khác $role; không tự đổi quyền."
        }
        $secure = Read-Host -AsSecureString "Mật khẩu đã lưu cho $email"
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try {
            $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
            if ($password.Length -lt 8) { throw 'Mật khẩu cần ít nhất 8 ký tự.' }
            if ($existing.Count -eq 0) {
                $body = @{ fullName = $account.Name; email = $email; password = $password } | ConvertTo-Json -Compress
                try {
                    $created = Invoke-RestMethod -Method Post -Uri "$CoreApiUrl/auth/register" -ContentType 'application/json' -Body $body
                } catch {
                    throw "Không tạo được $email qua Auth API; kiểm tra Core và trạng thái database."
                } finally { $body = $null }
                $userId = [guid]$created.user.id
                if ($role -ne 'READER') {
                    $check = @(Invoke-DemoSql "SELECT count(*) FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id='$userId' AND u.email_normalized='$email' AND r.role_code='READER';")
                    if ($check.Count -ne 1 -or $check[0] -ne '1') { throw "Vai trò mặc định của $email không đúng; dừng." }
                    Invoke-DemoSql "BEGIN; DELETE FROM user_roles WHERE user_id='$userId' AND role_code='READER'; INSERT INTO user_roles(user_id,role_code) VALUES ('$userId','$role'); COMMIT;" | Out-Null
                }
                Write-Host "[OK] Đã tạo $email với vai trò $role."
            } else { Write-Host "[OK] $email đã có đúng vai trò; giữ nguyên mật khẩu." }
            $loginBody = @{ identifier = $email; password = $password; remember = $false } | ConvertTo-Json -Compress
            try {
                $session = Invoke-RestMethod -Method Post -Uri "$CoreApiUrl/auth/login" -ContentType 'application/json' -Body $loginBody -SessionVariable cookies
            } catch { throw "Không đăng nhập được $email bằng mật khẩu vừa nhập; không đổi mật khẩu." }
            $me = Invoke-RestMethod -Method Get -Uri "$CoreApiUrl/auth/me" -Headers @{ Authorization = "Bearer $($session.accessToken)" }
            if ($me.email -cne $email -or @($me.roles).Count -ne 1 -or $me.roles[0] -cne $role) {
                throw "/auth/me trả sai danh tính hoặc vai trò cho $email."
            }
            $response = Invoke-WebRequest -SkipHttpErrorCheck -Method Get -Uri "$CoreApiUrl/branches" -Headers @{ Authorization = "Bearer $($session.accessToken)" }
            $expected = if ($role -eq 'READER') { 403 } else { 200 }
            if ($response.StatusCode -ne $expected) { throw "Phân quyền Staff sai cho $email." }
            $refreshed = Invoke-RestMethod -Method Post -Uri "$CoreApiUrl/auth/refresh" -WebSession $cookies
            if (-not $refreshed.accessToken) { throw "Refresh thất bại cho $email." }
            Invoke-RestMethod -Method Post -Uri "$CoreApiUrl/auth/logout" -WebSession $cookies | Out-Null
            Write-Host "[OK] Login, /auth/me, quyền Staff, refresh/logout: $email."
        } finally {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            $password = $null
            $loginBody = $null
            $session = $null
        }
    }
} finally { Pop-Location }
