# Claude Code CLI Crash Investigation

## The Issue
When launching the application via the Claude Code CLI, particularly when executing a workflow like `WF5` or using the `npm run safe-start` command (either directly or as part of a workflow), the `claude` CLI immediately crashes.

## Root Cause Analysis
The root cause is located in the `package.json` file under the `"safe-start"` script:

```json
"safe-start": "node -e \"try{require('child_process').execSync('taskkill /F /IM node.exe',{stdio:'ignore'})}catch{}\" && rm -rf .next && npm run build && npm run dev"
```

The script includes the command:
`taskkill /F /IM node.exe`

This Windows command forcefully terminates *all* running processes named `node.exe`. 

**Why this crashes Claude:**
The Claude Code CLI (`claude`) is built and runs on Node.js (which runs as a `node.exe` process in Windows). When the `safe-start` script executes the `taskkill /F /IM node.exe` command, it successfully kills any lingering Next.js development server as intended, but it also forcefully kills the Node process running the Claude CLI itself.

This effectively causes Claude to commit "suicide" any time it attempts to launch the app using this script or when a workflow (like WF5 or WF11) triggers it.

## The Solution
To fix this, the app needs a more targeted way to kill the Next.js development server without indiscriminately killing all Node instances.

### Approach 1: Kill by Port
Instead of killing all Node instances, target the process running on port 3000 (the default port for Next.js).

Update the `"safe-start"` script in `package.json` to:
```json
"safe-start": "node -e \"try{require('child_process').execSync('Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force', {shell: 'powershell.exe', stdio:'ignore'})}catch{}\" && rm -rf .next && npm run build && npm run dev"
```

### Approach 2: Use a Dedicated Package
Alternatively, use a cross-platform port-killing utility like `kill-port` as a dev dependency:

1. `npm install -D kill-port`
2. Update the script:
```json
"safe-start": "npx kill-port 3000 && rm -rf .next && npm run build && npm run dev"
```

Approach 1 is recommended as it doesn't require adding a new dependency and correctly leverages PowerShell to identify and terminate only the process hoarding port 3000.
