[CmdletBinding()]
param(
    [int]$CameraIndex = 1,
    [string]$HostAddress = "127.0.0.1",
    [ValidateRange(1, 65535)]
    [int]$Port = 8765,
    [string]$CorsOrigins = "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173,http://localhost:4173",
    [string]$VirtualEnvironment = ".venv"
)

$ErrorActionPreference = "Stop"
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$VisionRoot = Join-Path $RepositoryRoot "vision-service"
$VenvPython = Join-Path (Join-Path $RepositoryRoot $VirtualEnvironment) "Scripts\python.exe"

if (-not (Test-Path -LiteralPath $VenvPython)) {
    throw "No existe $VenvPython. Ejecuta primero scripts/setup-vision-node.ps1."
}

$env:VISION_CAMERA_INDEX = [string]$CameraIndex
$env:VISION_SERVICE_HOST = $HostAddress
$env:VISION_SERVICE_PORT = [string]$Port
$env:VISION_CORS_ORIGINS = $CorsOrigins
$env:OPENCV_VIDEOIO_MSMF_ENABLE_HW_TRANSFORMS = "0"

Write-Host "OrbiNodo Vision Node"
Write-Host "Host: $HostAddress"
Write-Host "Port: $Port"
Write-Host "Camera index: $CameraIndex"
Write-Host "CORS origins: $CorsOrigins"
Write-Host "La webcam permanecera cerrada hasta recibir POST /api/vision/start."

Push-Location $VisionRoot
try {
    & $VenvPython -m uvicorn app.service:app --host $HostAddress --port $Port
}
finally {
    Pop-Location
}
