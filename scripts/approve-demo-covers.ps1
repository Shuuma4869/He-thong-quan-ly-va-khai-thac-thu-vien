param(
    [string]$CoreApiUrl = 'http://127.0.0.1:8080/api/v1',
    [switch]$ConfirmDemoDatabase,
    [switch]$ListOnly
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')

$root = Get-LamsRoot
Import-LamsEnv (Join-Path $root '.env') -OverrideExisting
Test-LamsLocalConfiguration
if ($env:COMPOSE_PROJECT_NAME -ne 'lams' -or
    $env:CORE_DATABASE_URL -notmatch '^jdbc:postgresql://(localhost|127\.0\.0\.1):15432/lams_core(?:\?|$)' -or
    $CoreApiUrl -notmatch '^http://(localhost|127\.0\.0\.1):8080/api/v1$') {
    throw 'Chỉ hỗ trợ database LAMS demo trên máy này; không chấp nhận môi trường production.'
}

# Các bìa này đã được đối chiếu trực quan với tác phẩm và colophon của Standard Ebooks.
# Mỗi tranh gốc có tác giả mất trước năm 1923. Phần thiết kế do Standard Ebooks tạo thuộc CC0.
$covers = @(
    @{ Id='c64bd482-c582-567d-8037-0f0be2a3a388'; Title='Pride and Prejudice'; Author='Jane Austen'; Slug='jane-austen/pride-and-prejudice'; Art='A Wet Sunday Morning'; Artist='Edmund Blair Leighton'; Year=1896; Died=1922 },
    @{ Id='d1440e55-b19a-500e-85ae-f0a77e8249b1'; Title='Sense and Sensibility'; Author='Jane Austen'; Slug='jane-austen/sense-and-sensibility'; Art='At the Mirror'; Artist='Georg Friedrich Kersting'; Year=1827; Died=1847 },
    @{ Id='fc1b3d0e-d4f4-56d9-90a0-6a13d9c9ce58'; Title='Emma'; Author='Jane Austen'; Slug='jane-austen/emma'; Art='Rica'; Artist='Frederick Goodall'; Year=1894; Died=1904 },
    @{ Id='bbbf9205-11e7-5bca-a4f1-8cdc961290fa'; Title='Persuasion'; Author='Jane Austen'; Slug='jane-austen/persuasion'; Art='Woman at a Window'; Artist='Caspar David Friedrich'; Year=1822; Died=1840 },
    @{ Id='aba8d579-3778-57aa-97e3-0123cc8d2217'; Title='Northanger Abbey'; Author='Jane Austen'; Slug='jane-austen/northanger-abbey'; Art='Before the Mirror'; Artist='Édouard Manet'; Year=1876; Died=1883 },
    @{ Id='ffe90547-5883-572c-bb03-07e6277927f9'; Title='Jane Eyre'; Author='Charlotte Brontë'; Slug='charlotte-bronte/jane-eyre'; Art='Portrait of a Young Girl'; Artist='Vilhelm Hammershøi'; Year=1903; Died=1916 },
    @{ Id='c035322c-cc7b-5b50-b994-5caf85f4ec32'; Title='Wuthering Heights'; Author='Emily Brontë'; Slug='emily-bronte/wuthering-heights'; Art='Edith Villiers'; Artist='George Frederic Watts'; Year=1862; Died=1904 },
    @{ Id='40a05c93-3261-575b-b956-a2307ee0a799'; Title='Dracula'; Author='Bram Stoker'; Slug='bram-stoker/dracula'; Art='Italian Landscape of Ruins in the Moonlight'; Artist='Joseph Magnus Stäck'; Year=1850; Died=1868 }
)
if ($ListOnly) {
    $covers | ForEach-Object { "{0} | {1} | {2} ({3})" -f $_.Id,$_.Title,$_.Art,$_.Year }
    return
}
if (-not $ConfirmDemoDatabase -and (Read-Host 'Gõ DEMO để duyệt 8 bìa cho database local') -cne 'DEMO') {
    throw 'Đã hủy, không thay đổi ảnh.'
}

$credentialPath = Join-Path $root '.tools\demo-credentials.xml'
$credential = if (Test-Path -LiteralPath $credentialPath) {
    @(Import-Clixml -LiteralPath $credentialPath | Where-Object { $_.UserName -ceq 'admin.demo@lams.test' }) | Select-Object -First 1
} else { $null }
if (-not $credential) {
    $credential = [pscredential]::new('admin.demo@lams.test', (Read-Host -AsSecureString 'Mật khẩu admin.demo@lams.test'))
}
if ($credential -isnot [pscredential]) { throw 'Tài khoản demo không hợp lệ.' }
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
try {
    $loginBody = @{ identifier=$credential.UserName; password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer); remember=$false } | ConvertTo-Json -Compress
    $session = Invoke-RestMethod -Method Post -Uri "$CoreApiUrl/auth/login" -ContentType 'application/json' -Body $loginBody -SessionVariable cookies
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $loginBody = $null
}
$headers = @{ Authorization = "Bearer $($session.accessToken)" }
$me = Invoke-RestMethod -Method Get -Uri "$CoreApiUrl/auth/me" -Headers $headers
if ($me.email -cne 'admin.demo@lams.test' -or 'ADMIN' -notin @($me.roles)) {
    throw 'Phiên hiện tại không thuộc quản trị demo; không duyệt ảnh.'
}

$candidates = Import-Csv -LiteralPath (Join-Path $root 'tai-lieu\09-demo\anh-bia-ung-vien.csv')
Push-Location $root
try {
    foreach ($cover in $covers) {
        $candidate = @($candidates | Where-Object { $_.'Edition ID' -ceq $cover.Id })
        if ($candidate.Count -ne 1 -or $candidate[0].'Tác phẩm' -cne $cover.Title -or
            $candidate[0].'Tác giả' -cne $cover.Author -or $candidate[0].'Định danh nguồn' -cne $cover.Slug) {
            throw "Ứng viên $($cover.Title) không khớp danh sách đối chiếu; dừng."
        }
        $escapedId = $cover.Id
        $statement = "SELECT b.title || '|' || string_agg(a.name, ', ' ORDER BY a.name) FROM editions e JOIN books b ON b.id=e.book_id JOIN book_authors ba ON ba.book_id=b.id JOIN authors a ON a.id=ba.author_id WHERE e.id='$escapedId' GROUP BY b.title;"
        $records = @(& docker compose exec -T postgres psql -U $env:POSTGRES_USER -d lams_core -v ON_ERROR_STOP=1 -tA -c $statement)
        if ($LASTEXITCODE -ne 0 -or $records.Count -ne 1 -or $records[0].Trim() -cne "$($cover.Title)|$($cover.Author)") {
            throw "Edition $($cover.Id) không khớp tác phẩm và tác giả demo; dừng."
        }
        $uri = "$CoreApiUrl/catalog-media/editions/$escapedId"
        $existing = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
        $imageUrl = "https://standardebooks.org/ebooks/$($cover.Slug)/downloads/cover.jpg"
        if ($existing.media) {
            if ($existing.media.imageUrl -cne $imageUrl) { throw "Đã có ảnh khác cho $($cover.Title); không ghi đè." }
            Write-Host "[OK] $($cover.Title): đã duyệt từ lượt trước."
            continue
        }
        $repoSlug = $cover.Slug.Replace('/','_')
        $colophon = "https://github.com/standardebooks/$repoSlug/blob/master/src/epub/text/colophon.xhtml"
        $body = @{
            source='standard-ebooks'; sourceId=$cover.Slug
            sourceUrl="https://standardebooks.org/ebooks/$($cover.Slug)"; imageUrl=$imageUrl
            license='CC0 cho thiết kế Standard Ebooks; tranh gốc hết thời hạn bảo hộ theo đối chiếu demo'
            licenseUrl='https://standardebooks.org/about/standard-ebooks-and-the-public-domain'
            attribution="Standard Ebooks; tranh $($cover.Art) ($($cover.Year)) của $($cover.Artist)."
            evidence="Đã đối chiếu bìa với $($cover.Title) / $($cover.Author). Colophon: $colophon. Họa sĩ mất năm $($cover.Died); tranh hoàn thành năm $($cover.Year). Chỉ dùng cho dữ liệu demo local."
            confirmed=$true; expectedVersion=$null
        } | ConvertTo-Json -Compress
        $approved = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $body
        if ($approved.imageUrl -cne $imageUrl) { throw "Core trả ảnh không khớp $($cover.Title)." }
        Write-Host "[OK] Đã duyệt $($cover.Title)."
    }
} finally {
    Pop-Location
    try { Invoke-RestMethod -Method Post -Uri "$CoreApiUrl/auth/logout" -WebSession $cookies | Out-Null }
    catch { Write-Warning 'Không thu hồi được phiên duyệt ảnh; kiểm tra lại Core.' }
}
