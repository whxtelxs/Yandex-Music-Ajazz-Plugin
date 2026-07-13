'use strict';

const { spawn } = require('child_process');

function runPowerShell(script) {
    return new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', [
            '-NoProfile',
            '-WindowStyle', 'Hidden',
            '-ExecutionPolicy', 'Bypass',
            '-Command', script
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk.toString(); });
        child.stderr.on('data', chunk => { stderr += chunk.toString(); });
        child.on('error', reject);
        child.on('close', code => {
            if (code === 0) resolve(stdout.trim());
            else reject(new Error(stderr.trim() || stdout.trim() || `PowerShell exited with code ${code}`));
        });
    });
}

async function resolveHostProcess(pluginPid = process.pid) {
    if (process.platform !== 'win32') return null;
    const script = `
$startPid = ${Number(pluginPid)}
$current = $startPid
for ($i = 0; $i -lt 25; $i++) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$current" -ErrorAction SilentlyContinue
    if (-not $proc) { break }
    $exe = $proc.ExecutablePath
    if ($exe) {
        $name = [IO.Path]::GetFileNameWithoutExtension($exe).ToLower()
        if ($name -match 'stream|hotspot|ajazz|dock|mirabox') {
            [PSCustomObject]@{ pid = [int]$proc.ProcessId; exe = $exe } | ConvertTo-Json -Compress
            exit 0
        }
    }
    $parent = [int]$proc.ParentProcessId
    if ($parent -le 0 -or $parent -eq $current) { break }
    $current = $parent
}
`;
    try {
        const raw = await runPowerShell(script);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.exe || !parsed?.pid) return null;
        return { pid: Number(parsed.pid), exe: String(parsed.exe) };
    } catch {
        return null;
    }
}

module.exports = {
    resolveHostProcess
};
