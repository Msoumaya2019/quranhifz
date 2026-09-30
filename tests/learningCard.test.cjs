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

const debut=app.indexOf('function LearningCard(');
const fin=app.indexOf('function QuranScreen(');
const carte=app.slice(debut,fin);
const quran=app.slice(fin,app.indexOf('function ProgramScreen('));

test('la carte « Apprentissage » existe, et vit sur l’écran du Coran',()=>{
  assert(debut>=0,'la carte doit etre declaree');
  assert(fin>debut,'l’ecran du Coran doit suivre la carte');
  assert.match(quran,/<LearningCard state=\{state\} openToday=\{openToday\} \/>/,'la carte doit etre rendue par l’ecran du Coran');
  // Le resume vient du moteur, pas d'une phrase recopiee dans l'ecran.
  assert.match(carte,/learningSummary\(state\)/,'le resume doit venir du module');
  assert(!/learningSummary/.test(quran),'l’ecran ne doit pas calculer le resume lui-meme');
});

test('l’écran du Coran reçoit ce qu’il lui faut pour ouvrir l’apprentissage',()=>{
  assert.match(quran,/function QuranScreen\(\{state,openReader,openToday\}/);
  assert.match(quran,/state:AppState;openReader:\(r:Reader\)=>void;openToday:\(\)=>void/);
  // Le site d'appel doit fournir les deux, sinon le typage ne suivrait pas.
  assert.match(app,/\{tab==='Coran'&&<QuranScreen state=\{state\} openReader=\{openReader\} openToday=\{\(\)=>setTodayOpen\(true\)\} \/>\}/);
});

test('la carte porte le même glyphe que le raccourci « Apprentissage »',()=>{
  const raccourci=app.match(/shortcut\('Apprentissage','([^']+)'/);
  assert(raccourci,`le raccourci d’accueil doit exister`);
  assert(carte.includes(raccourci[1]),`la carte devrait porter « ${raccourci[1]} », comme l’accueil`);
});

test('la carte n’invente aucune taille de texte',()=>{
  const ailleurs=app.slice(0,debut)+app.slice(fin);
  const tailles=(texte)=>[...texte.matchAll(/fontSize:(\d+)/g)].map(m=>Number(m[1]));
  const siennes=[...new Set(tailles(carte))];
  assert(siennes.length>0,'la carte doit poser au moins une taille, sinon le controle est vide');
  const connues=new Set(tailles(ailleurs));
  for(const taille of siennes)assert(connues.has(taille),`taille ${taille} inventee : elle n’existe nulle part ailleurs`);
});
