# Next.js 16.4.6 security patch

Verified November 17, 2026 after the operator's Windows build reported a security upgrade from 16.4.2 to 16.4.6.

The npm advisory response for the previous production lockfile identified **GHSA-mfr8-8qww-v76h**, “Information disclosure across root params when a 'use cache' function is called through unstable_cache()”, as moderate severity, affecting `>=16.3.0 <=16.4.4`. See the [published advisory](https://github.com/advisories/GHSA-mfr8-8qww-v76h). This records package advisory applicability, not evidence that the operator's installation was exploited.

The registry confirmed the exact 16.4.6 package and integrity metadata. `package.json` now pins Next to `16.4.6`; the lockfile updates Next, its environment package and matching platform SWC packages. React and application behavior are not intentionally changed by this patch. The post-update npm audit returned zero known vulnerabilities across the locked dependencies at the time checked; this is not a guarantee against unknown or future issues.

## Installation

Keep the Nexus web server stopped while installing and building. Pull the feature branch update, run `npm.cmd ci` from the repository (or with its `--prefix` path), then run the production build and the existing Windows launcher. Confirm the build banner says **Next.js 16.4.6** before reopening Nexus. `npm ci` is necessary because pulling a lockfile does not update installed packages. The encrypted voice key, Jessica selection and usage allowance live outside node_modules and are preserved.

Do not use an ad hoc upgrade or `npm audit fix --force` to change unrelated dependencies. Further framework updates should update and validate the committed lockfile. A temporary Skip choice at the old CLI prompt did not install the patch; using “Skip until next version” is not a substitute for this upgrade.

## Verification

Production build and TypeScript pass on the patched dependency tree. The full desktop/mobile suite passed (464 passed, 8 skipped) against that build to check authentication, navigation, Google integration fixtures, business workflow, local voice, Jessica's cloud controls and isolated utility behavior. The synthetic runtime protocol check, connection and launcher tests, setup tests and local voice worker tests also passed. Live provider eligibility and the actual Jessica voice remain separate Windows acceptance checks; no live speech request is made by this security validation.
