param([int]$CorePort = 28481, [int]$InsightPort = 23401, [int]$FrontendPort = 25474, [switch]$UseExistingPrismaClient, [string]$ResultFile)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$projectRoot = Get-LamsRoot
if (-not $ResultFile) { $ResultFile = Join-Path $projectRoot '.tools\email-verification-result.json' }
New-Item -ItemType Directory -Path (Split-Path -Parent ([IO.Path]::GetFullPath($ResultFile))) -Force | Out-Null
$owner = [guid]::NewGuid().ToString('N')
$container = "lams-smtp-acceptance-$owner"
$created = $false
$keys = @('LAMS_EMAIL_ENABLED','LAMS_EMAIL_FROM','LAMS_SMTP_HOST','LAMS_SMTP_PORT','LAMS_SMTP_AUTH','LAMS_SMTP_STARTTLS','LAMS_SMTP_USERNAME','LAMS_SMTP_PASSWORD','LAMS_E2E_MAILPIT_URL','LAMS_E2E_MAILPIT_CONTAINER','LAMS_E2E_MAILPIT_OWNER')
$saved = @{}
foreach ($key in $keys) { $saved[$key] = [Environment]::GetEnvironmentVariable($key, 'Process') }
try {
    & docker run -d --name $container --label "lams.smtp-acceptance=$owner" -e 'MP_DATABASE=/tmp/lams-mailpit.db' -e 'MP_DISABLE_VERSION_CHECK=true' -p '127.0.0.1::1025' -p '127.0.0.1::8025' axllent/mailpit:v1.27.9
    if ($LASTEXITCODE -ne 0) { throw 'Không tạo được Mailpit riêng.' }
    $created = $true
    $smtp = & docker port $container 1025/tcp
    if ($smtp -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'SMTP phải bind loopback.' }
    $smtpPort = $Matches[1]
    $web = & docker port $container 8025/tcp
    if ($web -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Mailpit API phải bind loopback.' }
    $mailpit = "http://127.0.0.1:$($Matches[1])"
    $env:LAMS_E2E_MAILPIT_URL = $mailpit
    $env:LAMS_E2E_MAILPIT_CONTAINER = $container
    $env:LAMS_E2E_MAILPIT_OWNER = $owner
    $env:LAMS_EMAIL_ENABLED = 'true'
    $env:LAMS_EMAIL_FROM = 'no-reply@lams.test'
    $env:LAMS_SMTP_HOST = '127.0.0.1'
    $env:LAMS_SMTP_PORT = $smtpPort
    $env:LAMS_SMTP_AUTH = 'false'
    $env:LAMS_SMTP_STARTTLS = 'false'
    $env:LAMS_SMTP_USERNAME = ''
    $env:LAMS_SMTP_PASSWORD = ''
    & (Join-Path $PSScriptRoot 'test-phase1-e2e.ps1') -CorePort $CorePort -InsightPort $InsightPort -FrontendPort $FrontendPort -Grep 'Hồ sơ lưu thay đổi' -UseExistingPrismaClient:$UseExistingPrismaClient
    if ($LASTEXITCODE -ne 0) { throw 'Profile E2E không đạt.' }
    $web = & docker port $container 8025/tcp
    if ($web -notmatch '^127\.0\.0\.1:(\d+)$') { throw 'Mailpit mất binding loopback sau restart.' }
    $mailpit = "http://127.0.0.1:$($Matches[1])"
    $messages = Invoke-RestMethod "$mailpit/api/v1/messages"
    if ($messages.total -lt 1) { throw 'Chưa nhận được email qua SMTP.' }
    $observed = foreach ($message in $messages.messages) {
        $recipients = @($message.To | ForEach-Object Address)
        if ($recipients.Count -eq 0 -or @($recipients | Where-Object { $_ -notmatch '@example\.test$' }).Count -gt 0) {
            throw 'Có địa chỉ nhận ngoài fixture kiểm thử.'
        }
        $detail = Invoke-RestMethod "$mailpit/api/v1/message/$($message.ID)"
        $hasCode = $detail.Text -match 'Mã xác minh đổi email của bạn: [A-Z0-9]{12}'
        if (-not $hasCode) { throw 'Email không chứa mã xác minh hợp lệ.' }
        @{ recipientCount = $recipients.Count; subject = $message.Subject; verificationCodePresent = $hasCode }
    }
    @{ checkedAt = [datetime]::UtcNow.ToString('o'); sourceSha = (& git -C $projectRoot rev-parse HEAD);
        trackedSourceDirty = [bool](& git -C $projectRoot diff --name-only); smtp = 'Mailpit riêng, chỉ loopback, không relay email'; messages = @($observed);
        limitation = 'Mailpit: hủy, nhập sai, khóa sau 5 lần, cooldown, hết hạn bằng mốc thời gian fixture, yêu cầu đồng thời, quota 5/24h, nhập đúng, thu hồi phiên và đăng nhập bằng email mới. SMTP gián đoạn trả 503 và rollback pendingEmail; SMTP Internet chưa kiểm.'
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $ResultFile -Encoding utf8
    Write-Output 'SMTP_PROFILE_PASS: email nhận trong Mailpit, mã hợp lệ, không lưu mã hoặc nội dung thư vào bằng chứng.'
} finally {
    foreach ($key in $keys) { [Environment]::SetEnvironmentVariable($key, $saved[$key], 'Process') }
    if ($created) {
        $actual = & docker inspect --format '{{ index .Config.Labels "lams.smtp-acceptance" }}' $container
        if ($actual -eq $owner) { & docker rm -f $container | Out-Null } else { Write-Warning 'Không xóa container không khớp owner.' }
    }
}
