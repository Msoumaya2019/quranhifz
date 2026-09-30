const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('./build/core/program.js');
const r=require('./build/core/review.js');
const c=require('./build/core/consolidation.js');

const at='2026-09-29';

/** Un état avec une seule séance du jour, portant les trois derniers versets. */
function etat(){
  const state=p.defaultState();
  state.sessions=[{id:'s1',date:at,start:6234,end:6236,unit:'verse3',status:'todo'}];
  return state;
}

const seance=(state,id='s1')=>state.sessions.find(s=>s.id===id);

test('les trois réponses portent les libellés demandés, et sont distinctes',()=>{
  assert.deepEqual(Object.keys(r.sessionOutcomeLabels),['learned','toReview','notYet']);
  assert.deepEqual(Object.values(r.sessionOutcomeLabels),['Appris','À revoir','Pas encore appris']);
  // Trois boutons qui afficheraient le même texte ne seraient pas trois réponses.
  assert.equal(new Set(Object.values(r.sessionOutcomeLabels)).size,3);
});

test('« Appris » mémorise le passage et programme la consolidation du lendemain',()=>{
  const next=r.finalizeSession(etat(),'s1','learned',at);
  for(let id=6234;id<=6236;id++){
    assert.equal(next.knowledge[id],'perfect');
    assert.equal(next.memorizedAt[id],at);
  }
  assert.equal(seance(next).status,'done');
  assert.equal(seance(next).completedDate,at);
  // La consolidation repart de la date réelle d'apprentissage.
  const revision=next.revisions.find(rev=>rev.start===6234&&rev.end===6236);
  assert(revision,`aucune révision programmée : ${JSON.stringify(next.revisions)}`);
  assert.equal(revision.due,p.addDays(at,1));
  assert.equal(c.passageState(next,6235,at),'recentlyLearned');
});

test('« À revoir » ne compte jamais le passage comme appris, mais le signale difficile',()=>{
  const next=r.finalizeSession(etat(),'s1','toReview',at);
  assert.deepEqual(p.memorizedIds(next),[],'le passage ne doit pas compter comme mémorisé');
  assert.equal(next.knowledge[6235],'learning');
  assert.equal(seance(next).status,'postponed');
  for(let id=6234;id<=6236;id++){
    assert(next.difficultyMarkers[id]?.user,`verset ${id} non marqué`);
  }
  assert.equal(c.passageState(next,6235,at),'struggling');
});

test('« Pas encore appris » ne retient rien contre le passage',()=>{
  const next=r.finalizeSession(etat(),'s1','notYet',at);
  assert.deepEqual(p.memorizedIds(next),[]);
  assert.deepEqual(next.difficultyMarkers,{},'aucun marquage ne doit être posé');
  assert.equal(seance(next).status,'postponed');
  assert.equal(c.passageState(next,6235,at),'inProgress');
});

test('« À revoir » et « Pas encore appris » replanifient pareil, et ne disent pas la même chose',()=>{
  const a=r.finalizeSession(etat(),'s1','toReview',at);
  const b=r.finalizeSession(etat(),'s1','notYet',at);

  // Même replanification : le passage revient dans les deux cas, avec le même
  // découpage. C'est voulu — le moteur de référence (moteur-apprentissage,
  // `applyOutcome`) traite `toReview` et `notYet` comme deux reports, tous deux
  // repris avant le passage nouveau.
  const aVenir=state=>state.sessions.filter(s=>s.status==='todo').map(s=>`${s.start}-${s.end}`).sort();
  assert.deepEqual(aVenir(a),aVenir(b));
  assert(aVenir(a).length>0,'le passage doit revenir, sinon rien n’est éprouvé');

  // Ce qui diffère, c'est ce que le passage DEVIENT. Sans cette différence, la
  // troisième réponse ne servirait à rien et les deux boutons seraient un doublon.
  assert.equal(c.passageState(a,6235,at),'struggling');
  assert.equal(c.passageState(b,6235,at),'inProgress');
  assert.notEqual(c.passageState(a,6235,at),c.passageState(b,6235,at));
});

test('les trois réponses donnent trois états de passage différents',()=>{
  const etats=new Set(['learned','toReview','notYet'].map(
    outcome=>c.passageState(r.finalizeSession(etat(),'s1',outcome,at),6235,at),
  ));
  assert.deepEqual([...etats].sort(),['inProgress','recentlyLearned','struggling']);
  assert.equal(etats.size,3,'deux réponses donnent le même état : elles sont indiscernables');
});

test('« À revoir » ne retire jamais un marquage existant, ni le mot du professeur',()=>{
  const state=etat();
  state.difficultyMarkers={
    6235:{user:{createdAt:'2026-09-01'}},
    6236:{admin:{createdAt:'2026-09-02',comment:'Reprendre la prononciation'}},
  };
  const next=r.finalizeSession(state,'s1','toReview',at);

  // Un marquage posé plus tôt garde sa date : il n'a pas été basculé.
  assert.equal(next.difficultyMarkers[6235].user.createdAt,'2026-09-01');
  // Le mot du professeur survit, et le verset gagne en plus un marquage utilisateur.
  assert.equal(next.difficultyMarkers[6236].admin.comment,'Reprendre la prononciation');
  assert(next.difficultyMarkers[6236].user);
  assert(next.difficultyMarkers[6234].user);
});

test('« À revoir » retire le passage des mémorisés s’il y figurait',()=>{
  // Un passage repris n'est jamais considéré comme acquis : s'il était compté
  // comme su, la réponse doit le faire redescendre.
  const state=etat();
  state.knowledge={6234:'perfect',6235:'perfect',6236:'perfect'};
  state.memorizedAt={6234:at,6235:at,6236:at};
  const next=r.finalizeSession(state,'s1','toReview',at);
  assert.deepEqual(p.memorizedIds(next),[]);
  assert.equal(c.passageState(next,6235,at),'struggling');
});

test('une séance inconnue ne change rien',()=>{
  const state=etat();
  for(const outcome of ['learned','toReview','notYet']){
    assert.equal(r.finalizeSession(state,'inconnue',outcome,at),state,`${outcome} a modifié l’état`);
  }
});
