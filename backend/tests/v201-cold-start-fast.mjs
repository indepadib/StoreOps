import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>readFileSync(path.join(root,p),'utf8');
const bridge=read('netlify/functions/api.mts');
const readonlySession=read('backend/auth/session-readonly.mjs');

assert.match(bridge,/function statelessHealth\(/,'stateless health fast path missing');
assert.match(bridge,/X-StoreOps-Bridge','stateless'/,'stateless health must identify its bridge mode');
const defaultBlock=bridge.match(/export default async\(request:Request\)=>\{[\s\S]*?\n\};/)?.[0]||'';
assert(defaultBlock,'Netlify default handler missing');
assert(defaultBlock.indexOf('statelessHealth(request)')>=0,'health fast path must be invoked');
assert(defaultBlock.indexOf('statelessHealth(request)')<defaultBlock.indexOf('getDatabase()'),'health must respond before Netlify Database is initialized');

const dbRuntime=bridge.match(/async function loadDbRuntime\(\)[\s\S]*?async function loadRuntime/)?.[0]||'';
const fullRuntime=bridge.match(/async function loadRuntime\(\)[\s\S]*?async function refreshOpenDatabase/)?.[0]||'';
assert(dbRuntime&&fullRuntime,'light/full runtime split missing');
assert.doesNotMatch(dbRuntime,/server\.mjs/,'light DB runtime must not import the full backend server');
assert.match(fullRuntime,/server\.mjs/,'full runtime fallback must remain available');

const lightRoute=bridge.match(/async function handleLightRoute[\s\S]*?async function authenticatedUser/)?.[0]||'';
assert(lightRoute,'critical light route missing');
assert.match(lightRoute,/\/api\/bootstrap/,'bootstrap must use the light path');
assert.match(lightRoute,/manager-home-fast/,'manager Today local snapshot must use the light path');
assert.match(lightRoute,/canAccessStore/,'light manager path must enforce store permissions');
assert.match(bridge,/X-StoreOps-Fast-Path/,'light routes must be observable');
assert.match(bridge,/read-light/,'light read mode must be observable in Server-Timing headers');

assert.match(readonlySession,/verifyEntraToken/,'light auth must still validate the Entra token cryptographically');
assert.match(readonlySession,/active=1/,'light auth must reject disabled/unprovisioned accounts');
assert.doesNotMatch(readonlySession,/\b(?:UPDATE|INSERT|DELETE|REPLACE)\b/i,'read-only session resolver must never mutate StoreOps state');
assert.match(readonlySession,/supportsReadOnlySession/,'read-only auth capability guard missing');

const serveWrite=bridge.match(/async function serveWrite[\s\S]*?function errorResponse/)?.[0]||'';
assert.match(serveWrite,/pg_advisory_xact_lock/,'writes must remain serialized');
assert.match(serveWrite,/persistSnapshot/,'writes must remain durable');

console.log('V2.01 cold-start fast path contract OK');
