# Co-hosting: day-one operating guide

This release provides a shared local workflow for two trusted operators: intake → estimate → recorded acceptance → scheduled job → quality checklist → completion. It does not connect accounting, banking, ads, rental bookings or customer messaging. A saved status is your team's record, not independent evidence of a contract, payment, license or insurance.

## Update the ASUS

Keep Ollama and Nexus Voice running. Stop only the Mission Control server with Ctrl+C (answer Y to “Terminate batch job?”). In that server tab run each command separately:

```powershell
cd "$env:USERPROFILE\gulf-wing-mision-control"
```

```powershell
git pull origin main
```

```powershell
npm.cmd ci
```

```powershell
npm.cmd run build
```

```powershell
npm.cmd run start
```

Leave that window running. In a spare PowerShell tab in the project folder, run:

```powershell
npm.cmd run ready
```

The report shows setup gaps and network addresses, without displaying pairing secrets or customer content. A new workspace has no business.json until its first save. It never creates clients or records to make a readiness check pass.

## Import and verify your plans

Open http://127.0.0.1:3000/nexus and pair as a controller. In Ask Nexus, expand **Import business plans or Obsidian knowledge**. Select your four original PDFs and the integrated XLSX workbook from your laptop's files. Click **Import selected files**. The originals are unchanged. No document is committed to Git or uploaded to a model provider.

Limits: up to 10 files, 2 MB each, 8 MB per batch, 100 PDF pages, 40 workbook sheets, 5,000 rows per sheet and 2 MB total index. Reimporting an identical file name replaces its uploaded sections, retaining unrelated files. Files in a batch are saved together only after every extraction succeeds. JSON-pack import through this panel also merges; the older CLI vault importer still replaces the index.

PDFs must contain selectable text; OCR is not included. XLSX values come from saved formula caches, without recalculation. Financial projections are planning assumptions, not actual results. Keep the integrated workbook as the controlling numerical source and check its formulas in your spreadsheet editor.

Ask “What services can Co-hosting offer?” with **Knowledge only** and inspect the source passages/page numbers. Then use **Auto** to check a local-model answer against those passages. The model can also retrieve saved operating records and catalog descriptions; source labels distinguish these from imported plans. An 8 GB laptop with a small model can still give incomplete or mistaken answers. Customer communications and pricing require your review.

If you already imported the separate private JSON pack, you can keep using it. Reimporting original files can duplicate old pack passages under different IDs; export the current knowledge index before changing its contents. A full curated replacement remains available through the documented CLI importer.

## Review the service catalog

Open **Co-hosting → Load business records → Service catalog**. Review the starter descriptions, add your specific services and deactivate anything you do not offer. No template establishes an approved price. Do not put passwords, alarm/key codes or door PINs in notes.

## Run the daily workflow

1. Add a **Lead** with contact details, address, service, follow-up date and assignee. Edit details as conversations progress.
2. Use **Prepare property from lead** to prefill a separate property; review and save it.
3. Create an estimate, link the customer/property, describe scope and exclusions, and adjust labor/cost/margin assumptions. Draft price is before tax.
4. Save the estimate, then choose **Print estimate**. The customer copy shows scope and total, not your wage/margin inputs. Use **Print / Save as PDF** to create a file, then share it yourself.
5. Record **Sent**, **Accepted** or **Declined** only after the corresponding real event. No email, signature or payment is automated.
6. For an accepted estimate, set **New job date** and **New job assignee**, then choose **Create job**. That estimate can create one linked job. Edit the job to change scheduling or add follow-up notes.
7. Complete the readiness/quality checklist, record issues in notes and advance the job from Planned to Active to Complete. A Complete status does not itself verify payment or customer acceptance.
8. Use **Due today**, **Overdue**, assignee search and the summary counts for the daily work list. Dates are calendar dates; “today” follows each browser's local date.
9. Export a **Private business backup** at the end of the day. Separately export the knowledge index from Ask Nexus.

Business records live in .gulf-wing/business.json, independent of DEMO dashboard missions. All paired controllers have the same permissions. There is no employee time clock, payroll, invoicing ledger or automated tax calculation in this release.

## Your wife's phone and Chromebook

Use the same trusted Wi-Fi as the ASUS. The laptop must be on, awake and running Mission Control. In Nexus, expand **Family / team device access → Show laptop network addresses**. Open the correct Wi-Fi address on her Chrome browser. Your previously working address was http://10.0.0.213:3000/nexus; it may change after a router reconnect.

On each device, expand **Connect devices**, enter the private pairing code, then open **Co-hosting → Load business records**. Bookmark the page. Saved records refresh about every eight seconds when there are no unsaved edits. When a form has unsaved changes, a banner announces newer data; reload, review and save again. Stale server writes are rejected instead of silently overwriting another operator.

Sharing a controller code gives full workspace access, not a restricted employee login. Change history identifies a controller save, not an individual person. Use this only with trusted operators. Lost code: `npm.cmd run sync:setup -- --rotate` issues a new code and revokes all paired sessions without removing records; re-pair all devices afterward.

If her browser cannot connect, verify the Wi-Fi, current laptop IP, awake state and running server. On a trusted private Windows network, allow Node.js through Windows Firewall for **Private networks** if prompted. Do not disable the firewall or forward router ports.

Typed questions, intake, estimates and scheduling work over this local HTTP connection. Microphone recording on her phone/Chromebook needs HTTPS; local laptop voice uses localhost. Browser playback permissions may require a click. No HTTPS certificate, public URL or away-from-home connection is installed by this release.

## Private access while away: next stage

Use a private device-to-device connection with HTTPS and verify the chosen provider's current business-use licensing, or configure a privately hosted VPN. That requires setup on your ASUS and her devices and testing outside the Wi-Fi. We have not enabled it or exposed port 3000. Separate named accounts, per-user permissions, session management and individual audit identities should precede broader staff access.

## Morning acceptance check

- Review `npm.cmd run ready`; resolve missing server, pairing, knowledge and desired voice/model services.
- Verify a plan-based answer and its source pages.
- Save a clearly labeled test lead and estimate; print the estimate without exposing internal cost inputs.
- Record test acceptance and create one job; check its date, assignee and checklist.
- Confirm the saved change appears on your wife's device and the laptop.
- Download a backup, then retain it privately. Mark your test records Complete and label them as tests.

Technical checks cannot confirm company formation, customer terms, insurance, staffing, tax treatment or applicable permissions. Verify those real business prerequisites before performing services.
