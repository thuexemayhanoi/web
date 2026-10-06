#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
console.log('sync-shared-navigation.mjs is now a compatibility alias for the full shared-site build.');
const args=['tools/build-site.mjs',...process.argv.slice(2)];
const r=spawnSync(process.execPath,args,{stdio:'inherit'});
process.exit(r.status??1);
