# One-click Windows startup

After the reviewed launcher files are on the laptop, double-click **Start-Nexus.cmd** in the project folder. It starts installed Ollama, the built Mission Control app and the existing Nexus Voice worker in the background, then opens `http://localhost:3000/nexus`. No PowerShell tabs need to stay open for processes started by this launcher. Existing manually started services retain their original lifetime: keep their windows open until you intentionally stop them and let the launcher start them next time.

This starts existing tools only: no package/model downloads, git pull, build, pairing-code rotation, external provider activation or independent microphone recording. It needs Node, the installed dependencies, a completed production build, Ollama, and the voice environments/models already set up. Missing components produce instructions; they are not silently installed. The voice setup matches `scripts/start-nexus-voice.cmd`, including Isabella/Kokoro when the files exist.

## Desktop shortcut and optional sign-in startup

Run the installer once in Setup & Diagnostics from the project folder:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-nexus-shortcuts.ps1
```

This creates **Start Nexus** on the current user's Desktop. The execution-policy option applies to that invocation only; the installer does not change the system policy or require administrator privileges. Review the local script before running it if needed.

To also start services automatically when **you sign in to Windows**, run instead:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-nexus-shortcuts.ps1 -AtSignIn
```

For the quiet command above, the sign-in shortcut starts the components without opening a browser or microphone. Double-click the Desktop shortcut when you want the Nexus page. Browser microphone permission and **Start background assistant** remain explicit actions. This does not record audio while Windows starts.

To open Nexus at sign-in as well (for the saved automatic-listening preference):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-nexus-shortcuts.ps1 -AtSignIn -OpenAtSignIn
```

Then enable **Automatically resume background listening on this device** in the laptop browser once. Use localhost consistently. Previously granted microphone permission, Controller access and ready local voice are required. Browser sound policy may still require Resume listening. This opens the browser after the local service startup checks; it does not add a native microphone service or bypass Windows/browser permissions. Mute disables the saved listening preference.

To remove automatic startup while retaining the Desktop shortcut:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-nexus-shortcuts.ps1 -RemoveSignIn
```

No sign-in shortcut has been installed by building or downloading this repository. These steps must run on the actual Windows laptop; the cloud workspace cannot install them there. The shortcut points to this project folder, so reinstall it if the folder or Node installation moves. An existing shortcut with the same name is replaced; no other startup entries are changed.

## Behavior and recovery

- The launcher reuses recognized healthy services. Unrecognized occupied ports are reported; it never kills processes to free a port. A launch lock prevents simultaneous launchers. Managed process IDs conservatively prevent repeated starts while models warm up; process IDs are never used to kill a service. A reused stale PID may require checking the private state/logs rather than spawning again automatically.
- Private output logs go to `.gulf-wing/launcher-server.log`, `launcher-voice.log` and `launcher-ollama.log`. Existing logs over 2 MB rotate before a new start. Logs remain private and can include runtime diagnostics; do not post them publicly without review. The log file can grow during a long run.
- Initial model loading can take time. A component that times out may still be starting; check logs and use `npm.cmd run connections:check` before repeatedly retrying. Startup records and lock files are inside `.gulf-wing`; malformed state fails closed instead of guessing which processes to stop.
- Closing the browser does not stop launcher-started services. Windows sign-out/restart ends them. Automatic startup occurs at user sign-in, not before sign-in. There is no Windows system service, administrator task, crash supervisor or keep-awake override. If something exits, double-click Start Nexus again.
- The laptop must remain powered on and awake for phone/Chromebook/TV access. Sleep, shutdown, network changes and Windows updates can interrupt availability. This does not provide away-from-home connectivity.
- After a code update, stop the old Mission Control server intentionally, build the reviewed update once, then use the launcher. It does not restart a healthy old server automatically or replace a build while it is running.
- For troubleshooting, run `Start-Nexus.cmd` from PowerShell so messages remain visible. Native Windows detached-process lifetime, shortcut creation, sign-in behavior and actual voice/model readiness still need acceptance on the ASUS laptop.

Automated tests cover the platform-neutral startup decisions (reuse, no duplicates, occupied ports, warming models, missing files and component failure). They do not claim a native Windows installation was tested on Linux.

## Windows console-close voice failures

A `forrtl: error (200) ... window-CLOSE event` entry indicates console-close handling in the numeric runtime. An appended log may contain entries from older attempts; it does not by itself prove that the latest worker is stopped. Check current `/health` and the timestamped launcher header before changing processes.

Background voice now uses `.venv-voice/Scripts/pythonw.exe` with unbuffered output rather than attaching console Python to the launcher. Kokoro and Piper subprocesses use Windows `CREATE_NO_WINDOW` while retaining their pipes and output capture. No model packages or downloads change. The worker reports loading/readiness milestones without logging audio or prompts. If `pythonw.exe` is missing, the background launch reports missing setup rather than silently using console Python; the original foreground `scripts/start-nexus-voice.cmd` remains available for diagnosis with its window kept open.

The launcher conservatively treats a previously tracked live PID as pending even if the interpreter choice changed, avoiding a duplicate worker during an update. A healthy old worker is reused. To test the new background runtime, first identify and stop only the confirmed project voice worker if it is still running, then relaunch. Native console-close survival must be verified on the laptop; Linux fixture tests only validate startup choices, flags and protocol behavior.
