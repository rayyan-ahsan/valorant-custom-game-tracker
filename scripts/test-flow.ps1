param(
    [string]$PostgresBin,
    [ValidateRange(1, 100)][int]$Repeat = 1,
    [switch]$WithoutRace
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$originalPath = $env:PATH
$originalDatabase = $env:TEST_DATABASE_URL
$originalCgo = $env:CGO_ENABLED
$startedDatabase = $false
$testExitCode = 1

# pg_ctl launches a persistent child. Give it separate output handles so a
# redirected PowerShell pipeline does not wait for PostgreSQL itself to exit.
function Invoke-TestPgCtl([string]$Arguments) {
    $logID = [guid]::NewGuid().ToString('N')
    $stdout = Join-Path $testDirectory "pgctl-$logID.out.log"
    $stderr = Join-Path $testDirectory "pgctl-$logID.err.log"
    $process = Start-Process -FilePath $pgCtl -ArgumentList $Arguments -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $process.WaitForExit()
    Get-Content -LiteralPath $stdout -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    Get-Content -LiteralPath $stderr -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_ }
    return $process.ExitCode
}

Push-Location -LiteralPath $projectRoot
try {
    if (-not $WithoutRace) {
        $compiler = Get-Command gcc -ErrorAction SilentlyContinue
        if (-not $compiler) { throw 'Go race tests need GCC on PATH. Install a MinGW compiler, or use -WithoutRace to run only the integration checks.' }
        # Keep the compiler's DLLs ahead of unrelated DLLs installed by other apps.
        $env:PATH = "$(Split-Path -Parent $compiler.Source);$env:PATH"
        $env:CGO_ENABLED = '1'
    }

    if (-not $env:TEST_DATABASE_URL) {
        if (-not $PostgresBin) {
            $initdb = Get-Command initdb -ErrorAction SilentlyContinue
            if ($initdb) {
                $PostgresBin = Split-Path -Parent $initdb.Source
            } else {
                $installRoot = Join-Path $env:ProgramFiles 'PostgreSQL'
                $PostgresBin = Get-ChildItem -LiteralPath $installRoot -Directory -ErrorAction SilentlyContinue |
                    Sort-Object Name -Descending |
                    ForEach-Object { Join-Path $_.FullName 'bin' } |
                    Where-Object { Test-Path -LiteralPath (Join-Path $_ 'initdb.exe') } |
                    Select-Object -First 1
            }
        }
        if (-not $PostgresBin) { throw 'PostgreSQL was not found. Supply -PostgresBin or set TEST_DATABASE_URL to a disposable test database.' }
        $pgCtl = Join-Path $PostgresBin 'pg_ctl.exe'
        $testDirectory = Join-Path $projectRoot '.test-postgres'
        New-Item -ItemType Directory -Force -Path $testDirectory | Out-Null
        $dataDirectory = Join-Path $testDirectory 'data'
        if (-not (Test-Path -LiteralPath (Join-Path $dataDirectory 'PG_VERSION'))) {
            & (Join-Path $PostgresBin 'initdb.exe') -D $dataDirectory -U postgres -A trust --no-locale -E UTF8
            if ($LASTEXITCODE -ne 0) { throw 'Could not initialize the isolated test database.' }
        }
        if (Test-Path -LiteralPath (Join-Path $dataDirectory 'postmaster.pid')) {
            $statusExitCode = Invoke-TestPgCtl "-D `"$dataDirectory`" status"
            if ($statusExitCode -eq 0) {
                throw 'The test database is already running. Finish the other test run before starting this one.'
            }
        }
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
        $listener.Start()
        $port = $listener.LocalEndpoint.Port
        $listener.Stop()
        $databaseLog = Join-Path $testDirectory 'server.log'
        $startedDatabase = $true
        $startExitCode = Invoke-TestPgCtl "-D `"$dataDirectory`" -l `"$databaseLog`" -o `"-h 127.0.0.1 -p $port`" -w start"
        if ($startExitCode -ne 0) { throw "Could not start the isolated database. See $databaseLog" }
        $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:$port/postgres?sslmode=disable"
    }

    # All application tests are in the root Go package. Avoid traversing the
    # frontend's dependency tree or the ignored historical mock server.
    Write-Output "Running the application tests $Repeat time(s)."
    if ($WithoutRace) {
        & go test "-count=$Repeat" -timeout=180s .
    } else {
        & go test -race "-count=$Repeat" -timeout=180s .
    }
    $testExitCode = $LASTEXITCODE
} finally {
    if ($startedDatabase) {
        $stopExitCode = Invoke-TestPgCtl "-D `"$dataDirectory`" -m fast -w stop"
        if ($stopExitCode -ne 0) { Write-Warning "Test database did not shut down. See $databaseLog"; $testExitCode = 1 }
    }
    $env:PATH = $originalPath
    $env:TEST_DATABASE_URL = $originalDatabase
    $env:CGO_ENABLED = $originalCgo
    Pop-Location
}
exit $testExitCode
