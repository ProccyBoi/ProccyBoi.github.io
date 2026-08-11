param(
  [Parameter(Mandatory = $true)][string]$SourceRoot,
  [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $PSScriptRoot "..\assets\images\projects"
}

$items = @(
  @{ Source = "tramtrace\R6M26759.JPG"; Name = "tramtrace-hero" },
  @{ Source = "tramtrace\R6M26750.JPG"; Name = "tramtrace-parramatta" },
  @{ Source = "tramtrace\R6M26740.JPG"; Name = "tramtrace-cbd" },
  @{ Source = "tramtrace\R6M26703.JPG"; Name = "tramtrace-controller" },
  @{ Source = "dual-usb-green\R6M26779.JPG"; Name = "framework-dual-hero" },
  @{ Source = "dual-usb\R6M26801.JPG"; Name = "framework-dual-installed" },
  @{ Source = "dual-usb-green\R6M26771.JPG"; Name = "framework-dual-sides" },
  @{ Source = "dual-usb-green\R6M26770.JPG"; Name = "framework-dual-ports" },
  @{ Source = "dual-usb-green\R6M26768.JPG"; Name = "framework-dual-hub" },
  @{ Source = "rf-test\R6M26402.JPG"; Name = "rf-test-hero" },
  @{ Source = "rf-test\R6M26403.JPG"; Name = "rf-test-sma" },
  @{ Source = "rf-test\R6M26411.JPG"; Name = "rf-test-reverse" },
  @{ Source = "rf-test\R6M26408.JPG"; Name = "rf-test-details" },
  @{ Source = "reference-cover\R6M26547.JPG"; Name = "pcb-reference-hero" },
  @{ Source = "reference-cover\R6M26546.JPG"; Name = "pcb-reference-packages" },
  @{ Source = "reference-cover\R6M26566.JPG"; Name = "pcb-reference-traces" },
  @{ Source = "reference-cover\R6M26555.JPG"; Name = "pcb-reference-symbols" }
)

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq "image/jpeg" } |
  Select-Object -First 1

function Export-ResponsiveJpeg {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$Destination,
    [Parameter(Mandatory = $true)][int]$MaxWidth,
    [long]$Quality = 80
  )

  if (-not (Test-Path -LiteralPath $Source)) {
    throw "Missing source image: $Source"
  }

  $sourceImage = [System.Drawing.Image]::FromFile($Source)
  try {
    $width = [Math]::Min($MaxWidth, $sourceImage.Width)
    $height = [Math]::Round($sourceImage.Height * ($width / $sourceImage.Width))
    $bitmap = New-Object System.Drawing.Bitmap($width, $height)
    try {
      $bitmap.SetResolution(96, 96)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($sourceImage, 0, 0, $width, $height)
      }
      finally {
        $graphics.Dispose()
      }

      $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
      $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
        [System.Drawing.Imaging.Encoder]::Quality,
        $Quality
      )
      try {
        $bitmap.Save($Destination, $jpegCodec, $encoderParameters)
      }
      finally {
        $encoderParameters.Dispose()
      }
    }
    finally {
      $bitmap.Dispose()
    }
  }
  finally {
    $sourceImage.Dispose()
  }
}

$resolvedSource = [System.IO.Path]::GetFullPath($SourceRoot)
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputRoot)
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

if (-not (Test-Path -LiteralPath $resolvedSource -PathType Container)) {
  throw "Source folder does not exist: $resolvedSource"
}

if (-not $resolvedOutput.StartsWith($workspaceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Output must remain inside the website workspace."
}

New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

foreach ($item in $items) {
  $source = Join-Path $resolvedSource $item.Source
  foreach ($size in @(960, 1920)) {
    $destination = Join-Path $resolvedOutput "$($item.Name)-$size.jpg"
    Export-ResponsiveJpeg -Source $source -Destination $destination -MaxWidth $size
    Write-Host "Wrote $destination"
  }
}

Write-Host "Processed $($items.Count) selected project photos."
