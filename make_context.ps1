param(
  [Parameter(Mandatory=$true)]
  [string]$Prompt,

  [Parameter(Mandatory=$true)]
  [string]$Pattern,

  # 0 = samo match linije; 1 = match + 1 pre/posle
  [int]$Context = 0,

  [int]$MaxFiles = 25,
  [int]$MaxMatchesPerFile = 10,

  # hard limit da ne pređeš “roman”
  [int]$MaxTotalMatches = 120,

  [string]$Out = "_CONTEXT_PACK.txt"
)

$ErrorActionPreference = "Stop"
Write-Host ">> Generating context pack (compact)..."

# Candidate files
$filesAll = Get-ChildItem -Recurse -File -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch "\\(node_modules|\.git|dist|build|\.next|out|coverage)\\"
  } |
  Where-Object { $_.Extension -match "^\.(ts|tsx|js|jsx|json|md|sql)$" }

# Global matches (to pick top files)
$matches = Select-String -Path $filesAll.FullName -Pattern $Pattern -AllMatches -CaseSensitive:$false -ErrorAction SilentlyContinue

# Pick files ranked by number of hits (most relevant first)
$rankedFiles =
  $matches |
  Group-Object Path |
  Sort-Object Count -Descending |
  Select-Object -First $MaxFiles

@"
# CONTEXT PACK (COMPACT)
Generated: $(Get-Date)
Root: $(Get-Location)

## USER PROMPT
$Prompt

## PATTERN
$Pattern

## INCLUDED FILES (top $MaxFiles by hit count)
$($rankedFiles | ForEach-Object { "$($_.Count)  $($_.Name)" } | Out-String)

--- EXCERPTS ---
"@ | Out-File $Out -Encoding utf8

$total = 0

foreach ($g in $rankedFiles) {
  if ($total -ge $MaxTotalMatches) { break }

  $file = $g.Name
  "`n===== FILE: $file =====`n" | Out-File $Out -Append -Encoding utf8

  $m2 = Select-String -Path $file -Pattern $Pattern -Context $Context,$Context -AllMatches -CaseSensitive:$false -ErrorAction SilentlyContinue |
        Select-Object -First $MaxMatchesPerFile

  foreach ($m in $m2) {
    if ($total -ge $MaxTotalMatches) { break }
    $total++

    # print minimal: line number + (optional) 1 line pre/post depending on Context
    if ($Context -gt 0 -and $m.Context -and $m.Context.PreContext) {
      $m.Context.PreContext | ForEach-Object { ("  " + $_) } | Out-File $Out -Append -Encoding utf8
    }

    ("L" + $m.LineNumber + ": " + $m.Line.TrimEnd()) | Out-File $Out -Append -Encoding utf8

    if ($Context -gt 0 -and $m.Context -and $m.Context.PostContext) {
      $m.Context.PostContext | ForEach-Object { ("  " + $_) } | Out-File $Out -Append -Encoding utf8
    }

    "---" | Out-File $Out -Append -Encoding utf8
  }
}

"`n# TOTAL_MATCHES: $total (limit $MaxTotalMatches)`n" | Out-File $Out -Append -Encoding utf8
Write-Host ">> Done. Created $Out with $total matches."