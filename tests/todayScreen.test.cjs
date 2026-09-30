const {test}=require('node:test');
const assert=require('node:assert/strict');
const chemin=require('node:path');
const {readFileSync}=require('node:fs');

// Un banc qui lit une source est satisfait par un COMMENTAIRE qui decrit
// l'intention : chercher un motif dans le texte brut ne prouve rien. On retire
// donc les commentaires avant toute recherche.
//
// Piege mesure : `https://tanzil.net` vit dans une CHAINE, ligne 435. Un retrait
// naif de `//` jusqu'a la fin de ligne mangerait cette chaine et tout le code qui
// la suit. On ne retire donc que les commentaires de bloc et les lignes qui
// COMMENCENT par `//`.
const brut=readFileSync(chemin.join(__dirname,'..','src','App.tsx'),'utf8');
const sansCommentaires=(texte)=>texte
  .replace(/\/\*[\s\S]*?\*\//g,'')
  .split('\n')
  .map(ligne=>(/^[ \t]*\/\//.test(ligne)?'':ligne))
  .join('\n');
const app=sansCommentaires(brut);

test('le retrait des commentaires ne mange pas le code',()=>{
  // Sans ce garde, un motif trop large rendrait le banc vert en ne trouvant
  // plus rien — ou en trouvant n'importe quoi.
  assert(app.length>brut.length*0.8,`source amputee : ${app.length} sur ${brut.length}`);
  assert(app.includes("'https://tanzil.net'"),'une chaine contenant // a ete mangee');
});

test('l’ecran « Programme du jour » est declare, branche et refermable',()=>{
  assert.match(app,/function TodayScreen\(/,'l’ecran doit exister');
  assert.match(app,/const \[todayOpen,setTodayOpen\]=useState\(false\)/,'le drapeau doit exister');

  // Il est dans la chaine de rendu, et AVANT le repli sur les onglets : sinon il
  // ne s'afficherait jamais.
  const branche=app.indexOf('todayOpen?<TodayScreen');
  assert(branche>=0,'l’ecran doit etre branche dans la chaine de rendu');
  assert(branche<app.indexOf('<ScrollView key={tab}'),'il doit etre evalue avant les onglets');

  // Trois portes vers l'ecran du jour : le raccourci d'accueil, le bouton du
  // programme, et la carte « Apprentissage » de l'ecran du Coran. Ce nombre est
  // voulu — en retirer une doit se voir, en ajouter une doit se decider.
  assert.equal((app.match(/openToday=\{\(\)=>setTodayOpen\(true\)\}/g)||[]).length,3);

  // Le geste de retour le referme, et l'en-tete disparait tant qu'il est ouvert.
  assert.match(app,/if\(todayOpen\)\{setTodayOpen\(false\);return;\}/);
  assert.match(app,/&&!reviewOpen&&!todayOpen&&/);
});

test('l’ecran du jour n’invente aucune taille de texte',()=>{
  const debut=app.indexOf('function TodayScreen(');
  const fin=app.indexOf('function ReviewScreen(');
  assert(debut>=0&&fin>debut,'l’ecran doit etre encadrable dans la source');
  const ecran=app.slice(debut,fin);
  const ailleurs=app.slice(0,debut)+app.slice(fin);

  const tailles=(texte)=>[...texte.matchAll(/fontSize:(\d+)/g)].map(m=>Number(m[1]));
  const siennes=[...new Set(tailles(ecran))];
  assert(siennes.length>0,'l’ecran doit definir des tailles');

  const connues=new Set(tailles(ailleurs));
  for(const taille of siennes){
    assert(connues.has(taille),`taille ${taille} inventee : elle n’existe nulle part ailleurs dans l’application`);
  }

  // Il calcule ses blocs, il ne les ecrit pas a la main.
  assert.match(ecran,/const plan=todayPlan\(state\)/);
  assert.match(ecran,/plan\.blocks\.map\(/);
});
