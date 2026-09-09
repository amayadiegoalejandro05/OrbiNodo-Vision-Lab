[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:8765"
)

$ErrorActionPreference = "Stop"
$NormalizedBaseUrl = $BaseUrl.TrimEnd("/")

function Get-ResponseProperty {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Response,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $Property = $Response.PSObject.Properties[$Name]
    if ($null -eq $Property) {
        throw "La respuesta de Vision Service no contiene la propiedad requerida '$Name'."
    }

    return $Property.Value
}

Write-Host "Consultando $NormalizedBaseUrl sin iniciar la webcam..."
try {
    $HealthResponse = Invoke-RestMethod -Method Get -Uri "$NormalizedBaseUrl/health" -TimeoutSec 5
    $StatusResponse = Invoke-RestMethod -Method Get -Uri "$NormalizedBaseUrl/api/vision/status" -TimeoutSec 5
}
catch {
    Write-Error "Vision Service no esta disponible en $NormalizedBaseUrl. $($_.Exception.Message)"
    exit 1
}

$Diagnostic = [pscustomobject]@{
    Health = Get-ResponseProperty -Response $HealthResponse -Name "status"
    State = Get-ResponseProperty -Response $HealthResponse -Name "state"
    Prepared = Get-ResponseProperty -Response $HealthResponse -Name "prepared"
    Camera = Get-ResponseProperty -Response $HealthResponse -Name "camera"
    CameraIndex = Get-ResponseProperty -Response $HealthResponse -Name "camera_index"
    Running = Get-ResponseProperty -Response $StatusResponse -Name "running"
    Fps = Get-ResponseProperty -Response $StatusResponse -Name "fps"
    LatestTimestamp = Get-ResponseProperty -Response $StatusResponse -Name "timestamp"
    Error = Get-ResponseProperty -Response $StatusResponse -Name "error"
}

$Diagnostic | Format-List

if ($Diagnostic.Running) {
    Write-Warning "La camara ya estaba activa antes del check; este script no la inicio ni la detuvo."
}
