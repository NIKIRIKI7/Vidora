param(
    [int[]]$Ports = @(8355, 5173, 11434)
)

$ErrorActionPreference = 'SilentlyContinue'

foreach ($p in $Ports) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen
    if (-not $conns) {
        Write-Host "port $p : nothing listening"
        continue
    }
    $pids = $conns.OwningProcess | Sort-Object -Unique
    foreach ($procId in $pids) {
        $proc = Get-Process -Id $procId
        if ($proc) {
            Write-Host ("port {0} -> kill pid {1} ({2})" -f $p, $procId, $proc.ProcessName)
            Stop-Process -Id $procId -Force
        }
    }
}

Write-Host "done"
