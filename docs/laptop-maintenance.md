# Nexus laptop maintenance

## What this installs

The app includes a small authenticated maintenance API and Connections panel. It runs **only two fixed operations**, with no user-supplied executable, command, arguments, paths or environment:

- Check local Nexus connections using the existing diagnostic.
- Start missing installed services through the existing Windows launcher, without opening a browser. Healthy services are reused; unknown occupied ports are not cleared.

The API runs as the Windows user who launched Mission Control. It is not an administrator service, remote PowerShell terminal, AI tool-call bridge or remote-desktop connection for Codex. It does not install software, pull Git updates, rebuild the running application, terminate processes, access arbitrary files or change firewall rules. The Mission Control server must already be running to use its UI; Start Nexus remains the recovery entry point if the server is down.

## One-time local enablement

After these reviewed files are installed in the project folder on the actual Windows laptop, double-click **Enable-Nexus-Maintenance.cmd**. Node and the existing project files are sufficient. No additional package, SSH server or paid service is required. Enablement writes only `.gulf-wing/maintenance.json`; it does not change pairing codes or Windows security settings.

Open Nexus → Connections → Laptop maintenance. All paired controllers can use these controls; display-only devices cannot. Existing shared controller access is appropriate only for your trusted-device prototype, not unrelated customers, contractors or distinct SaaS tenants. No model automatically invokes these controls in this increment.

Double-click **Disable-Nexus-Maintenance.cmd** to revoke future operations. An already-running operation is not force-terminated. No Windows service or additional startup entry is installed.

## Controls and records

POST requires the existing controller session and same-origin checks. Unknown action names and extra command/argument fields are rejected. Operations are serialized within the Node host. Fixed Node scripts run without a shell, with bounded output and execution time. Returned messages omit subprocess output. Private audit entries contain operation ID, action, start/result state and time, not prompts, credentials or raw command output. Local launcher logs remain the diagnostic source.

A timeout/failure is reported as needing attention, not proof that all descendants stopped. Startup can legitimately leave a slow-loading service warming up; repeat diagnostics before retrying. Enable/disable applies to future requests, not a process cancellation policy. Back up/protect `.gulf-wing` with the existing private application data.

## What is not installed remotely

The development workspace cannot install anything on the owner's laptop without a working authenticated connection. OpenSSH/Tailscale are not installed or enabled by this change; no public port is opened. A future remote-development connection needs a supported execution client and separate device authentication. Do not paste SSH private keys, pairing codes or credentials into chat.

Automated tests run on Linux with synthetic sessions. They verify strict allowlisting, controller/display separation, cross-origin rejection and disabled UI. Actual Windows service startup continues to require laptop acceptance using the existing launcher.
