param(
  [string]$OutputRoot = (Join-Path $PSScriptRoot "..\assets\images\projects")
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$items = @(
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Telemetry\R6M26625.JPG"; Name = "skylabs-telemetry-hero" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Telemetry\R6M26626.JPG"; Name = "skylabs-telemetry-alt" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Telemetry\R6M26627.JPG"; Name = "skylabs-telemetry-reverse" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Telemetry\R6M26629.JPG"; Name = "skylabs-telemetry-gnss" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Telemetry\R6M26638.JPG"; Name = "skylabs-telemetry-macro" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Telemetry\R6M26645.JPG"; Name = "skylabs-telemetry-interface" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Ground Station\R6M26653.JPG"; Name = "skylabs-ground-hero" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Ground Station\R6M26654.JPG"; Name = "skylabs-ground-alt" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Ground Station\R6M26664.JPG"; Name = "skylabs-ground-reverse" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Ground Station\R6M26668.JPG"; Name = "skylabs-ground-detail" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Skylabs\Ground Station\R6M26670.JPG"; Name = "skylabs-ground-interface" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Glitch Tester\Bus\R6M26580.JPG"; Name = "switchmode-bus-hero" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Glitch Tester\Bus\R6M26572.JPG"; Name = "switchmode-bus-detail" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Glitch Tester\Bus\R6M26578.JPG"; Name = "switchmode-bus-alt" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Glitch Tester\Channel\R6M26584.JPG"; Name = "switchmode-channel-hero" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Glitch Tester\Channel\R6M26596.JPG"; Name = "switchmode-channel-reverse" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Glitch Tester\Channel\R6M26607.JPG"; Name = "switchmode-channel-assembled" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\To Be Sorted\edited\Glitch Tester\Channel\R6M26614.JPG"; Name = "switchmode-channel-detail" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\R6M26423.JPG"; Name = "framework-hero" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\R6M26421.JPG"; Name = "framework-angle" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\R6M26427.JPG"; Name = "framework-detail" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\R6M26429.JPG"; Name = "framework-esp32" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\R6M26446.JPG"; Name = "lora-receiver-hero" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\R6M26452.JPG"; Name = "lora-receiver-silkscreen" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\R6M26464.JPG"; Name = "lora-receiver-system" },
  @{ Source = "D:\Photos + Videos\Electronics Photos\R6M26459.JPG"; Name = "lora-receiver-antenna" }
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

      $qualityEncoder = [System.Drawing.Imaging.Encoder]::Quality
      $encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
      $encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($qualityEncoder, $Quality)
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

$resolvedOutput = [System.IO.Path]::GetFullPath($OutputRoot)
$workspaceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $resolvedOutput.StartsWith($workspaceRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Output must remain inside the website workspace."
}

New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

foreach ($item in $items) {
  foreach ($size in @(960, 1920)) {
    $destination = Join-Path $resolvedOutput "$($item.Name)-$size.jpg"
    Export-ResponsiveJpeg -Source $item.Source -Destination $destination -MaxWidth $size
    Write-Host "Wrote $destination"
  }
}

$referenceRoot = "C:\Users\procc\Downloads\Website\assets\processed"
$legacyNames = @(
  "runswift1-web.jpg",
  "runswift2-web.jpg",
  "loratalkie-web.jpg",
  "dash1-web.jpg",
  "dash2-web.jpg",
  "metroboard1-web.jpg",
  "metroboard2-web.jpg",
  "metroboard3-web.jpg",
  "metroboard4-web.jpg"
)

foreach ($name in $legacyNames) {
  $source = Join-Path $referenceRoot $name
  if (-not (Test-Path -LiteralPath $source)) {
    throw "Missing approved reference image: $source"
  }
  Copy-Item -LiteralPath $source -Destination (Join-Path $resolvedOutput $name) -Force
}

Write-Host "Processed $($items.Count) authorised source images and copied $($legacyNames.Count) approved existing project images."
