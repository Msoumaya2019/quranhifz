const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const chemin=require('node:path');

const brut=readFileSync(chemin.join(__dirname,'..','src','App.tsx'),'utf8');
const sansCommentaires=(texte)=>texte
  .replace(/\/\*[\s\S]*?\*\//g,'')
  .split('\n')
  .map(ligne=>(/^[ \t]*\/\//.test(ligne)?'':ligne))
  .join('\n');
const app=sansCommentaires(brut);

test('le retrait des commentaires ne mange pas le code',()=>{
  assert(app.length>brut.length*0.8,`source amputee : ${app.length} sur ${brut.length}`);
  assert(app.includes("'https://tanzil.net'"),'une chaine contenant // a ete mangee');
});

const debutOnboarding=app.indexOf('function Onboarding(');
const onboarding=app.slice(debutOnboarding,app.indexOf('function ReaderScreen('));

test('la liste des étapes est la seule source du nombre d’écrans',()=>{
  assert.match(onboarding,/const etapes=reviewsEnabled\(state\)\?\[0,1,2,3,4\]:\[0,1,2,3\];/,'l’étape de révision doit disparaître avec l’espace Révisions');
  assert.match(onboarding,/const derniere=etapes\[etapes\.length-1\];/);
  assert.match(onboarding,/CONFIGURATION · \$\{step\+1\}\/\$\{etapes\.length\}/,'le compteur doit dériver de la liste');
  assert(!/\$\{step\+1\}\/4/.test(onboarding),'un nombre d’écrans écrit en dur redeviendrait faux');
  assert.match(onboarding,/\{step===derniere\?'Créer mon programme':'Continuer'\}/,'le dernier bouton doit être le dernier de la liste, pas un indice fixe');
});

test('les cinq étapes ont chacune leur titre',()=>{
  const titres=onboarding.match(/\['Que connais-tu déjà \?'.*?'À quelle fréquence réviser \?'\]/);
  assert(titres,'la liste des titres doit exister');
  // Cinq titres = quatre séparateurs. Un titre manquant décalerait les écrans.
  assert.equal((titres[0].match(/','/g)||[]).length,4,`titres trouvés : ${titres[0]}`);
});

test('l’étape des jours mène à celle du rythme, et seule la dernière termine',()=>{
  assert.match(onboarding,/if\(step<derniere\)\{setStep\(step\+1\);return;\}/,'une étape intermédiaire doit avancer, pas terminer');
  const avance=onboarding.indexOf('if(step<derniere)');
  const termine=onboarding.indexOf('onboardingDone:true');
  assert(avance>=0&&termine>avance,'la création du programme doit venir après l’avance d’étape');
});

test('l’étape du rythme de révision propose les quatre cycles, et les applique',()=>{
  const bloc=onboarding.slice(onboarding.indexOf('{step===4&&'),onboarding.indexOf('{!!error&&'));
  assert(bloc,'l’etape 4 doit exister');
  const valeurs=[...bloc.matchAll(/\[(\d+),'/g)].map(m=>Number(m[1]));
  assert.deepEqual(valeurs,[7,14,21,30],`cycles proposés : ${valeurs.join(', ')}`);
  // Le choix doit s'appliquer, et l'etat courant doit se lire au meme endroit.
  assert.match(bloc,/update\(setReviewCycle\(state,jours\)\)/);
  assert.match(bloc,/selected=\{reviewCycleDays\(state\)===jours\}/);
});

test('l’étape du rythme n’introduit aucune taille de texte',()=>{
  const bloc=onboarding.slice(onboarding.indexOf('{step===4&&'),onboarding.indexOf('{!!error&&'));
  assert(!/fontSize:/.test(bloc),'une taille de texte a été introduite dans cette étape');
});

test('le cycle des révisions n’a plus qu’une seule valeur par défaut',()=>{
  // Trois endroits portaient « ?? 7 » : les Réglages, l'écran des révisions et
  // l'étape nouvelle. Le défaut vit maintenant dans `reviewCycleDays`.
  // Dépendance mesurée : recopier un défaut dans l'étape fait aussi tomber la
  // vérification des quatre cycles, qui épingle la lecture `reviewCycleDays`.
  // C'est la même donnée lue à deux titres — les deux doivent la voir.
  assert(!app.includes('cycleDays??7'),'un défaut recopié subsiste');
  assert.equal((app.match(/reviewCycleDays\(state\)/g)||[]).length,3,'les trois lectures doivent passer par l’accesseur');
});
