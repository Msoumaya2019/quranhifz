const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const chemin=require('node:path');

const brut=readFileSync(chemin.join(__dirname,'..','src','App.tsx'),'utf8');
// Retrait des commentaires limite aux commentaires de bloc et aux lignes qui
// COMMENCENT par « // ». Une chaine contenant « // » (une URL) est donc laissee
// intacte — le test suivant le verifie, sinon ce banc serait muet pour la
// mauvaise raison.
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

test('la fin de passage prend la réponse, pas un code à trois branches',()=>{
  assert.match(app,/import \{[^}]*SessionOutcome[^}]*\} from '\.\/core\/review'/,`SessionOutcome doit être importé`);
  assert.match(app,/const validate=\(outcome:SessionOutcome\)=>/,'la fonction doit recevoir la réponse');
  assert.match(app,/update\(finalizeSession\(state,reader\.sessionId,outcome\)\)/,'elle doit la passer au moteur');
});

test('les trois réponses sont branchées, et leurs libellés viennent du module',()=>{
  for(const outcome of ['learned','toReview','notYet']){
    assert.match(app,new RegExp(`validate\\('${outcome}'\\)`),`la réponse ${outcome} n’est branchée nulle part`);
    assert.match(app,new RegExp(`sessionOutcomeLabels\\.${outcome}`),`le libellé de ${outcome} doit venir du module`);
  }
  // Si les anciens codes restaient, trois boutons continueraient de produire
  // deux effets : c'est le défaut que ce branchement corrige.
  for(const vieux of ["validate('done')","validate('work')","validate('postpone')"]){
    assert(!app.includes(vieux),`ancien code encore présent : ${vieux}`);
  }
});

test('le bloc de fin de séance n’introduit aucune taille de texte',()=>{
  const ligne=app.split('\n').find(l=>l.includes("section('Après ma séance')"));
  assert(ligne,'le bloc « Après ma séance » doit exister');
  assert(!/fontSize:/.test(ligne),'une taille de texte a été introduite dans ce bloc');
  // Les trois libellés viennent du module, et non d'une chaîne recopiée : une
  // seule source de vérité pour les trois réponses.
  assert.equal((ligne.match(/sessionOutcomeLabels\./g)||[]).length,3);
});
