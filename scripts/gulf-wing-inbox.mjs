import {readGulfWingInbox} from '../lib/server/gulf-wing-integration.ts';
try { console.log(JSON.stringify(readGulfWingInbox(),null,2)); }
catch { console.error('The Gulf Wing inbox could not be read. Check local integration configuration.'); process.exitCode=1; }
