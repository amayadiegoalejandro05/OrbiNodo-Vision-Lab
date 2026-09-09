[CmdletBinding()]
param(
    [string]$PythonCommand = "python",
    [string]$VirtualEnvironment = ".venv"
)

$ErrorActionPreference = "Stop"
$RepositoryRoot = Split-Path -Parent $PSScriptRoot
$VisionRoot = Join-Path $RepositoryRoot "vision-service"
$VenvRoot = Join-Path $RepositoryRoot $VirtualEnvironment
$VenvPython = Join-Path $VenvRoot "Scripts\python.exe"

if (-not (Get-Command $PythonCommand -ErrorAction SilentlyContinue)) {
    throw "Python no esta disponible mediante '$PythonCommand'. Instala Python 3 y vuelve a ejecutar el setup."
}

$PythonVersionText = & $PythonCommand -c "import sys; print('.'.join(map(str, sys.version_info[:3])))"
$PythonVersion = [version]$PythonVersionText
if ($PythonVersion -lt [version]"3.11") {
    throw "Python 3.11 o posterior es requerido. Version encontrada: $PythonVersionText"
}
Write-Host "Python verificado: $PythonVersionText"

if (-not (Test-Path -LiteralPath $VenvPython)) {
    Write-Host "Creando entorno virtual en $VenvRoot"
    & $PythonCommand -m venv $VenvRoot
}

Write-Host "Instalando dependencias fijadas en vision-service/requirements.lock.txt"
& $VenvPython -m pip install --requirement (Join-Path $VisionRoot "requirements.lock.txt")

$Models = @(
    @{
        Name = "face_detection_yunet_2023mar.onnx"
        Sha256 = "8F2383E4DD3CFBB4553EA8718107FC0423210DC964F9F4280604804ED2552FA4"
    },
    @{
        Name = "face_recognition_sface_2021dec.onnx"
        Sha256 = "0BA9FBFA01B5270C96627C4EF784DA859931E02F04419C829E83484087C34E79"
    }
)

$MissingModels = @()
foreach ($Model in $Models) {
    $ModelPath = Join-Path $VisionRoot ("models\" + $Model.Name)
    if (-not (Test-Path -LiteralPath $ModelPath)) {
        $MissingModels += $Model.Name
        continue
    }

    $ActualHash = (Get-FileHash -LiteralPath $ModelPath -Algorithm SHA256).Hash
    if ($ActualHash -ne $Model.Sha256) {
        throw "Checksum invalido para $($Model.Name). No se usara un modelo de origen incierto."
    }
    Write-Host "Modelo verificado: $($Model.Name)"
}

if ($MissingModels.Count -gt 0) {
    Write-Warning "Faltan modelos: $($MissingModels -join ', ')"
    Write-Warning "Consulta vision-service/models/README.md para obtenerlos manualmente desde OpenCV Zoo."
    throw "Setup incompleto: faltan modelos ONNX verificados."
}

Write-Host "Setup terminado. No se abrio la webcam, no se enrolaron personas y no se crearon secretos."
