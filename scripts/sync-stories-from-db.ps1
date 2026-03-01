$ErrorActionPreference = 'Stop'

$query = @"
SELECT
  pa.alias,
  n.title,
  DATE_FORMAT(FROM_UNIXTIME(n.created), '%Y-%m-%d') AS created_at,
  COALESCE(b.body_summary, '') AS body_summary
FROM c4pk_mig.node_field_data n
JOIN c4pk_mig.path_alias pa ON pa.path = CONCAT('/node/', n.nid)
LEFT JOIN c4pk_mig.node__body b ON b.entity_id=n.nid AND b.deleted=0
WHERE n.type='article' AND pa.alias LIKE '/stories/%'
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
$missingLocal = 0

foreach ($line in $rows) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }

  $parts = $line -split "`t", 4
  if ($parts.Count -lt 4) { continue }

  $alias = ($parts[0] ?? '').Trim()
  $title = Escape-Frontmatter($parts[1] ?? '')
  $date = Escape-Frontmatter($parts[2] ?? '')
  $summary = Escape-Frontmatter($parts[3] ?? '')

  if (-not $alias.StartsWith('/stories/')) { continue }
  $slug = $alias.Substring(9)
  if ([string]::IsNullOrWhiteSpace($slug)) { continue }

  $mdPath = Join-Path (Get-Location) ("src/content/stories/$slug.md")
  if (-not (Test-Path -LiteralPath $mdPath)) {
    $missingLocal++
    continue
  }

  $raw = Get-Content -LiteralPath $mdPath -Raw
  $new = $raw

  $new = [regex]::Replace($new, '(?m)^title:\s*".*"\s*$', "title: `"$title`"")
  $new = [regex]::Replace($new, '(?m)^summary:\s*".*"\s*$', "summary: `"$summary`"")
  $new = [regex]::Replace($new, '(?m)^date:\s*".*"\s*$', "date: `"$date`"")

  if ($new -ne $raw) {
    Set-Content -LiteralPath $mdPath -Value $new -NoNewline
    $updated++
  }
}

Write-Output "updated_files=$updated"
Write-Output "missing_local_markdown=$missingLocal"
