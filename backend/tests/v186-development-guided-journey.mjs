import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const js=readFileSync(path.join(root,'frontend/js/development.js'),'utf8');
const css=readFileSync(path.join(root,'frontend/development.css'),'utf8');

for(const label of ['Sourcing local','Étude & validation','Négociation','Contrat','Travaux','Pré-ouverture','Ouvert'])assert.match(js,new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')),`missing journey stage ${label}`);
assert.match(js,/PARCOURS DÉVELOPPEMENT/,'project detail must explicitly present the guided journey');
assert.match(js,/ÉTAPE ACTUELLE/,'current stage must be visually explicit');
assert.match(js,/À FAIRE MAINTENANT/,'journey must expose one immediate action');
assert.match(js,/Valider et continuer/,'current milestone must use one primary CTA');
assert.match(js,/Ce qu’il faut terminer maintenant/,'current-stage checklist must be explicit');
assert.match(js,/currentStageMilestones\(p\)/,'visible checklist must be filtered to current stage');
assert.match(js,/nextPendingMilestone\(p\)/,'journey must derive the immediate next milestone');
assert.match(js,/Passer à \$\{esc\(STAGE_LABELS\[next\]/,'stage progression CTA must exist');
assert.match(js,/Voir le détail complet/,'business case and history must remain secondary');
assert.match(js,/Créer et démarrer le parcours/,'new project must explicitly start the journey');
assert.doesNotMatch(js,/Jalons & gates/,'old technical-first detail wording must not be the primary project experience');

for(const klass of ['.dev-journey-rail','.dev-journey-primary','.dev-journey-check','.dev-journey-layout'])assert(css.includes(klass),`missing guided journey style ${klass}`);
assert.match(css,/\.dev-journey-step\.current/,'current journey stage must have a dedicated visual state');
assert.match(css,/\.dev-journey-check\.next/,'next required action must have a dedicated visual state');

console.log('V1.86 guided Development journey contract OK');
