$ErrorActionPreference = 'Stop'

$query = @"
SELECT
  pa.alias,
  n.title,
  DATE_FORMAT(FROM_UNIXTIME(n.created), '%Y-%m-%d') AS created_at,
  COALESCE(b.body_summary, '') AS body_summary,
  COALESCE(f.uri, '') AS image_uri,
  COALESCE(d.field_due_date_value, '') AS event_date,
  COALESCE(l.field_location_value, '') AS location
FROM c4pk_mig.node_field_data n
JOIN c4pk_mig.path_alias pa ON pa.path = CONCAT('/node/', n.nid)
LEFT JOIN c4pk_mig.node__body b ON b.entity_id=n.nid AND b.deleted=0
LEFT JOIN c4pk_mig.node__field_image i ON i.entity_id=n.nid AND i.deleted=0
LEFT JOIN c4pk_mig.file_managed f ON f.fid=i.field_image_target_id
LEFT JOIN c4pk_mig.node__field_due_date d ON d.entity_id=n.nid AND d.deleted=0
LEFT JOIN c4pk_mig.node__field_location l ON l.entity_id=n.nid AND l.deleted=0
WHERE n.type='article' AND pa.alias LIKE '/events/%'
ORDER BY pa.alias;
"@

function Escape-Frontmatter([string]$value) {
  if ($null -eq $value) { return '' }
  $clean = $value -replace '\r?\n', ' '
  $clean = $clean.Trim()
  $clean = $clean.Replace('\\', '\\\\').Replace('"', '\\"')
  return $clean
}

$rows = docker exec mariadb mariadb -N -B -uroot -pmy-secret-pw -e $query

$updated = 0
$imageUpdated = 0
$imagesDownloaded = 0
$downloadFailed = 0
$missingLocal = 0
$failedSlugs = New-Object System.Collections.Generic.List[string]

foreach ($line in $rows) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }

  $parts = $line -split "`t", 7
  if ($parts.Count -lt 7) { continue }

  $alias = ($parts[0] ?? '').Trim()
  $title = Escape-Frontmatter($parts[1] ?? '')
  $createdAt = Escape-Frontmatter($parts[2] ?? '')
  $summary = Escape-Frontmatter($parts[3] ?? '')
  $imageUri = ($parts[4] ?? '').Trim()
  $endDate = Escape-Frontmatter($parts[5] ?? '')
  $location = Escape-Frontmatter($parts[6] ?? '')

  if (-not $alias.StartsWith('/events/')) { continue }
  $slug = $alias.Substring(8)
  if ([string]::IsNullOrWhiteSpace($slug)) { continue }

  $mdPath = Join-Path (Get-Location) ("src/content/events/$slug.md")
  if (-not (Test-Path -LiteralPath $mdPath)) {
    $missingLocal++
    continue
  }

  $newImagePath = $null

  if (-not [string]::IsNullOrWhiteSpace($imageUri) -and $imageUri.StartsWith('public://')) {
    try {
      $rel = $imageUri.Substring(9)
      $segments = $rel -split '/'
      $encodedSegments = foreach ($segment in $segments) { [System.Uri]::EscapeDataString($segment) }
      $url = 'https://codeforpakistan.org/sites/default/files/' + ($encodedSegments -join '/')

      $ext = [System.IO.Path]::GetExtension($rel)
      if ([string]::IsNullOrWhiteSpace($ext)) { $ext = '.jpg' }

      $targetRel = "/media/events-$slug$ext"
      $targetFs = Join-Path (Get-Location) ("public" + ($targetRel -replace '/', '\\'))
      New-Item -ItemType Directory -Force -Path (Split-Path $targetFs) | Out-Null

      Invoke-WebRequest -Uri $url -OutFile $targetFs -UseBasicParsing

      if ((Test-Path -LiteralPath $targetFs) -and ((Get-Item -LiteralPath $targetFs).Length -gt 0)) {
        $imagesDownloaded++
        $newImagePath = $targetRel
      }
      else {
        $downloadFailed++
        $failedSlugs.Add($slug)
      }
    }
    catch {
      $downloadFailed++
      $failedSlugs.Add($slug)
    }
  }

  $raw = Get-Content -LiteralPath $mdPath -Raw
  $new = $raw

  $new = [regex]::Replace($new, '(?m)^title:\s*".*"\s*$', "title: `"$title`"")
  $new = [regex]::Replace($new, '(?m)^summary:\s*".*"\s*$', "summary: `"$summary`"")
  $new = [regex]::Replace($new, '(?m)^location:\s*".*"\s*$', "location: `"$location`"")
  $new = [regex]::Replace($new, '(?m)^createdAt:\s*".*"\s*\r?\n', '')
  $new = [regex]::Replace($new, '(?m)^startDate:\s*".*"\s*\r?\n', '')
  $new = [regex]::Replace($new, '(?m)^endDate:\s*".*"\s*\r?\n', '')
  $new = [regex]::Replace(
    $new,
    '(?m)^location:\s*".*"\s*$',
    "location: `"$location`"`r`nstartDate: `"$createdAt`"`r`nendDate: `"$endDate`""
  )
  $new = [regex]::Replace($new, '(?m)^group:\s*".*"\s*\r?\n', '')
  $new = [regex]::Replace($new, '(?m)^designation:\s*".*"\s*\r?\n', '')
  $new = [regex]::Replace($new, '(?m)^dueDate:\s*".*"\s*\r?\n', '')

  if ($newImagePath) {
    $new2 = [regex]::Replace($new, '(?m)^image:\s*".*"\s*$', "image: `"$newImagePath`"")
    if ($new2 -ne $new) { $imageUpdated++ }
    $new = $new2
  }

  if ($new -ne $raw) {
    Set-Content -LiteralPath $mdPath -Value $new -NoNewline
    $updated++
  }
}

Write-Output "updated_files=$updated"
Write-Output "image_updated=$imageUpdated"
Write-Output "images_downloaded=$imagesDownloaded"
Write-Output "download_failed=$downloadFailed"
Write-Output "missing_local_markdown=$missingLocal"
if ($failedSlugs.Count -gt 0) {
  $unique = $failedSlugs | Sort-Object -Unique
  Write-Output ("failed_slugs=" + ($unique -join ','))
}
