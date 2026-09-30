const test=require('node:test');
const assert=require('node:assert/strict');
const p=require('./build/core/program.js');
const c=require('./build/core/consolidation.js');

const start='2026-09-21';

function learned(ids,day=start){
  let state=p.defaultState();
  for(const id of ids)state.knowledge[id]='perfect';
  state.memorizedAt=Object.fromEntries(ids.map(id=>[id,day]));
  return state;
}

test('les seuils de consolidation dérivent tous des paliers',()=>{
  assert.deepEqual([...c.consolidationStages],[1,3,7]);
  assert.equal(c.recentWindowDays,c.consolidationStages[1]-1);
  assert.equal(c.stableFromDay,c.consolidationStages[1]);
  // Un seul endroit à changer : les deux seuils suivraient.
  assert.equal(c.recentWindowDays,2);
  assert.equal(c.stableFromDay,3);
});

test('un verset jamais travaillé est « nouveau »',()=>{
  const state=p.defaultState();
  assert.equal(c.passageState(state,6236,start),'new');
});

test('un verset d’une séance reportée est « en cours », pas « nouveau »',()=>{
  let state=p.defaultState();
  state.sessions=[{id:'s',date:start,start:6234,end:6236,unit:'verse3',status:'postponed'}];
  assert.equal(c.passageState(state,6235,start),'inProgress');
  assert.equal(c.passageState(state,6233,start),'new');
});

test('un passage appris reste « récemment appris » jusqu’au troisième jour',()=>{
  const state=learned([6236]);
  assert.equal(c.passageState(state,6236,start),'recentlyLearned');
  assert.equal(c.passageState(state,6236,'2026-09-22'),'recentlyLearned');
  assert.equal(c.passageState(state,6236,'2026-09-23'),'recentlyLearned');
  assert.equal(c.passageState(state,6236,'2026-09-24'),'toConsolidate');
});

test('il n’est jamais immédiatement « acquis » après l’apprentissage',()=>{
  const state=learned([6236]);
  for(const day of [start,'2026-09-22','2026-09-23']){
    assert.notEqual(c.passageState(state,6236,day),'acquired');
  }
});

test('« à consolider » puis « acquis » selon l’échéance',()=>{
  let state=learned([6236],'2026-09-01');
  state.reviewDue={6236:'2026-09-20'};
  assert.equal(c.passageState(state,6236,'2026-09-19'),'acquired');
  assert.equal(c.passageState(state,6236,'2026-09-20'),'toConsolidate');
  assert.equal(c.passageState(state,6236,'2026-09-25'),'toConsolidate');
});

test('« à retravailler » prime sur tout le reste',()=>{
  let state=learned([6236]);
  state.difficultyMarkers={6236:{user:{createdAt:start}}};
  assert.equal(c.passageState(state,6236,start),'struggling');
  assert.equal(c.passageState(state,6236,'2027-01-01'),'struggling');

  const teacher={...learned([6235]),difficultyMarkers:{6235:{admin:{createdAt:start,comment:'Reprendre'}}}};
  assert.equal(c.passageState(teacher,6235,'2027-01-01'),'struggling');
});

test('les échéances suivent les paliers J+1, J+3, J+7',()=>{
  assert.equal(c.nextConsolidationDate(start),'2026-09-22');
  assert.equal(c.nextConsolidationDate(start,[1]),'2026-09-24');
  assert.equal(c.nextConsolidationDate(start,[1,3]),'2026-09-28');
  assert.equal(c.nextConsolidationDate(start,[1,3,7]),null);
  assert.deepEqual(c.remainingStages(start),[1,3,7]);
  assert.deepEqual(c.remainingStages(start,[1]),[3,7]);
  assert.deepEqual(c.remainingStages(start,[1,3,7]),[]);
});

test('la fenêtre de consolidation ne se rouvre pas après coup',()=>{
  const state=learned([6236],'2026-09-01');
  assert.equal(c.isConsolidating(state,6236,'2026-09-02'),true);
  assert.equal(c.isConsolidating(state,6236,'2026-09-04'),false);
  assert.equal(c.isConsolidating(p.defaultState(),6236,'2026-09-04'),false);
});

test('l’état d’une plage est celui de son verset le plus en retard',()=>{
  let state=p.defaultState();
  state.knowledge={6234:'perfect',6235:'perfect',6236:'perfect'};
  state.memorizedAt={6234:'2026-09-21',6235:'2026-09-21',6236:'2026-09-21'};
  state.difficultyMarkers={6236:{user:{createdAt:start}}};
  assert.equal(c.rangeState(state,{start:6234,end:6236},'2026-10-01'),'struggling');
  state.difficultyMarkers={};
  assert.equal(c.rangeState(state,{start:6234,end:6236},'2026-10-01'),'toConsolidate');
});

test('le décompte par état couvre les six états',()=>{
  let state=learned([6236]);
  state.sessions=[{id:'s',date:start,start:6234,end:6234,unit:'verse1',status:'postponed'}];
  state.difficultyMarkers={6235:{user:{createdAt:start}}};
  state.knowledge[6235]='perfect';
  state.memorizedAt[6235]=start;
  const counts=c.stateCounts(state,[6233,6234,6235,6236],start);
  assert.equal(counts.new,1);
  assert.equal(counts.inProgress,1);
  assert.equal(counts.struggling,1);
  assert.equal(counts.recentlyLearned,1);
  assert.equal(Object.values(counts).reduce((a,b)=>a+b,0),4);
});

test('l’ordre d’affichage ne sert pas de rang de gravité',()=>{
  // L'ordre d'affichage place « à retravailler » après « à consolider »…
  assert(c.passageStateOrder.indexOf('struggling')>c.passageStateOrder.indexOf('toConsolidate'));
  // …alors que sa gravité est la plus forte. Confondre les deux faisait
  // passer un verset à retravailler pour moins grave qu'un verset à consolider.
  assert(c.passageStateSeverity.struggling<c.passageStateSeverity.toConsolidate);
  assert(c.passageStateSeverity.toConsolidate<c.passageStateSeverity.recentlyLearned);
  assert(c.passageStateSeverity.recentlyLearned<c.passageStateSeverity.acquired);
});

test('les six états ont un libellé français',()=>{
  for(const state of c.passageStateOrder){
    assert.equal(typeof c.passageStateLabels[state],'string');
    assert(c.passageStateLabels[state].length>0);
  }
  assert.equal(c.passageStateLabels.acquired,'Acquis');
  assert.equal(c.passageStateLabels.toConsolidate,'À consolider');
});

/* ------------------------------------------------------------------ *
 * Les trois blocs du jour
 * ------------------------------------------------------------------ */

const bloc=(plan,kind)=>plan.blocks.find(b=>b.kind===kind);
const idsDe=(range)=>{const out=[];for(let id=range.start;id<=range.end;id++)out.push(id);return out;};
const versesDe=(block)=>block.tasks.flatMap(idsDe);

test('les trois blocs sont toujours là, dans l’ordre d’affichage',()=>{
  const plan=c.todayPlan(p.defaultState(),start);
  assert.deepEqual(plan.blocks.map(b=>b.kind),['new','toConsolidate','revision']);
  assert.deepEqual(plan.blocks.map(b=>b.title),['NOUVEAU','À CONSOLIDER','RÉVISION']);
  for(const b of plan.blocks)assert(b.hint.length>0,`${b.kind} sans explication`);
});

test('aucun verset n’apparaît dans deux blocs',()=>{
  // Un état chargé : une séance du jour, une séance en retard, un passage appris
  // hier, un appris il y a longtemps, et un verset à la fois MARQUÉ difficile
  // ET arrivé à échéance — le cas qui se ferait compter deux fois.
  let state=p.defaultState();
  state.sessions=[
    {id:'s1',date:'2026-09-29',start:6100,end:6104,unit:'verse5',status:'todo'},
    {id:'s2',date:'2026-09-25',start:6110,end:6112,unit:'verse3',status:'todo'},
    {id:'s3',date:'2026-09-29',start:6120,end:6122,unit:'verse3',status:'done'},
  ];
  state.knowledge={6230:'perfect',6232:'perfect',6236:'perfect'};
  state.memorizedAt={6230:'2026-09-28',6232:'2026-09-01',6236:'2026-09-01'};
  state.difficultyMarkers={6236:{user:{createdAt:'2026-09-02'}}};

  const plan=c.todayPlan(state,'2026-09-29');
  const tous=plan.blocks.flatMap(versesDe);
  assert(tous.length>0,'le corpus doit produire du travail, sinon rien n’est éprouvé');
  assert.equal(new Set(tous).size,tous.length,`verset en double : ${tous.join(',')}`);

  // Le verset marqué ET échu est dans RÉVISION, et une seule fois.
  const revision=versesDe(bloc(plan,'revision'));
  assert.equal(revision.filter(id=>id===6236).length,1);
  assert(!versesDe(bloc(plan,'toConsolidate')).includes(6236));
});

test('NOUVEAU retient les séances à faire, y compris en retard, pas les terminées',()=>{
  let state=p.defaultState();
  state.sessions=[
    {id:'s1',date:'2026-09-29',start:6100,end:6104,unit:'verse5',status:'todo'},
    {id:'s2',date:'2026-09-25',start:6110,end:6112,unit:'verse3',status:'todo'},
    {id:'s3',date:'2026-09-29',start:6120,end:6122,unit:'verse3',status:'done'},
    {id:'s4',date:'2026-10-05',start:6130,end:6131,unit:'verse2',status:'todo'},
  ];
  const plan=c.todayPlan(state,'2026-09-29');
  const verses=versesDe(bloc(plan,'new'));
  assert.deepEqual(verses,[...idsDe({start:6110,end:6112}),...idsDe({start:6100,end:6104})]);
  assert(!verses.includes(6120),'une séance terminée ne revient pas en NOUVEAU');
  assert(!verses.includes(6130),'une séance à venir n’est pas du travail d’aujourd’hui');
  assert.equal(bloc(plan,'new').verses,8);
  assert.equal(plan.lateSessions,1);
});

test('À CONSOLIDER retient le passage appris hier, pas celui appris aujourd’hui',()=>{
  let state=p.defaultState();
  state.knowledge={6234:'perfect',6236:'perfect'};
  state.memorizedAt={6234:'2026-09-29',6236:'2026-09-28'};
  const plan=c.todayPlan(state,'2026-09-29');
  const verses=versesDe(bloc(plan,'toConsolidate'));
  assert(verses.includes(6236),'appris hier : le premier palier est atteint');
  assert(!verses.includes(6234),'appris aujourd’hui : rien à consolider encore');
});

test('RÉVISION retient ce qui est marqué difficile, une seule fois',()=>{
  let state=p.defaultState();
  state.knowledge={6236:'perfect'};
  state.memorizedAt={6236:'2026-09-01'};
  state.difficultyMarkers={6236:{user:{createdAt:'2026-09-02'}}};
  const plan=c.todayPlan(state,'2026-09-29');
  assert.deepEqual(versesDe(bloc(plan,'revision')),[6236]);
  assert.deepEqual(versesDe(bloc(plan,'toConsolidate')),[]);
});

test('désactiver les révisions vide À CONSOLIDER et RÉVISION, pas NOUVEAU',()=>{
  let state=p.defaultState();
  state.sessions=[{id:'s1',date:'2026-09-29',start:6100,end:6104,unit:'verse5',status:'todo'}];
  state.knowledge={6236:'perfect'};
  state.memorizedAt={6236:'2026-09-28'};
  state.reviewSettings={enabled:false,cycleDays:7};
  const plan=c.todayPlan(state,'2026-09-29');
  assert.equal(versesDe(bloc(plan,'new')).length,5);
  assert.deepEqual(versesDe(bloc(plan,'toConsolidate')),[]);
  assert.deepEqual(versesDe(bloc(plan,'revision')),[]);
});

test('le total du jour est la somme des blocs, sans double compte',()=>{
  let state=p.defaultState();
  state.sessions=[
    {id:'s1',date:'2026-09-29',start:6100,end:6104,unit:'verse5',status:'todo'},
    {id:'s2',date:'2026-09-25',start:6110,end:6112,unit:'verse3',status:'todo'},
  ];
  state.knowledge={6230:'perfect',6236:'perfect'};
  state.memorizedAt={6230:'2026-09-28',6236:'2026-09-01'};
  state.difficultyMarkers={6236:{user:{createdAt:'2026-09-02'}}};
  const plan=c.todayPlan(state,'2026-09-29');
  const somme=plan.blocks.reduce((n,b)=>n+b.verses,0);
  assert.equal(plan.totalVerses,somme);
  assert.equal(plan.totalVerses,new Set(plan.blocks.flatMap(versesDe)).size);
  // 10 = 8 (les deux séances, dont celle en retard) + 1 (appris hier) + 1 (marqué).
  // Cette valeur ABSOLUE est voulue : la seule égalité « total = somme des blocs »
  // resterait vraie si `verses` se trompait partout de la même façon. Elle rend
  // donc ce test sensible au filtre des séances — dépendance mesurée, pas subie.
  assert.equal(plan.totalVerses,10);
});

test('un état neuf n’a rien à faire, et le dit',()=>{
  const plan=c.todayPlan(p.defaultState(),start);
  for(const b of plan.blocks)assert.deepEqual(b.tasks,[],`${b.kind} devrait être vide`);
  assert.equal(plan.totalVerses,0);
  assert.equal(plan.lateSessions,0);
});

/* ------------------------------------------------------------------ *
 * Le résumé de la carte « Apprentissage »
 * ------------------------------------------------------------------ */

const seance=(date,start_,end_)=>({id:`${date}-${start_}`,date,start:start_,end:end_,unit:'verse3',status:'todo'});

test('sans programme, le résumé invite à définir un objectif',()=>{
  assert.equal(c.learningSummary(p.defaultState(),start),'Aucune séance prévue : définis ton objectif pour commencer.');
});

test('du travail aujourd’hui : le résumé compte les versets',()=>{
  const state={...p.defaultState(),sessions:[seance('2026-09-29',6234,6236)]};
  assert.equal(c.learningSummary(state,'2026-09-29'),'3 versets aujourd’hui.');
});

test('une séance en retard est du travail d’aujourd’hui, et le résumé le dit',()=>{
  const state={...p.defaultState(),sessions:[seance('2026-09-25',6234,6236)]};
  assert.equal(c.learningSummary(state,'2026-09-29'),'3 versets aujourd’hui · 1 séance en retard.');
  // Deux séances en retard se comptent au pluriel.
  const deux={...p.defaultState(),sessions:[seance('2026-09-24',6234,6236),seance('2026-09-25',6230,6232)]};
  assert.equal(c.learningSummary(deux,'2026-09-29'),'6 versets aujourd’hui · 2 séances en retard.');
});

test('un seul verset s’écrit au singulier',()=>{
  const state={...p.defaultState(),sessions:[seance('2026-09-29',6236,6236)]};
  assert.equal(c.learningSummary(state,'2026-09-29'),'1 verset aujourd’hui.');
});

test('rien aujourd’hui : le résumé annonce la prochaine séance, datée',()=>{
  const state={...p.defaultState(),sessions:[seance('2026-10-05',6234,6236)]};
  assert.equal(c.learningSummary(state,'2026-09-29'),'Rien aujourd’hui · prochaine séance le 05/10/2026 (3 versets).');
});

test('la prochaine séance est la plus proche, pas la première de la liste',()=>{
  // L'ordre du tableau ne doit pas décider : la plus proche est la dernière.
  const state={...p.defaultState(),sessions:[seance('2026-10-05',6234,6236),seance('2026-10-01',6230,6230)]};
  assert.equal(c.learningSummary(state,'2026-09-29'),'Rien aujourd’hui · prochaine séance le 01/10/2026 (1 verset).');
});

test('une séance terminée ne compte ni aujourd’hui ni comme prochaine',()=>{
  // Terminée ET datée dans le futur : elle ne doit apparaître ni dans le travail
  // du jour, ni comme « prochaine séance ». Le filtre sur le statut est donc
  // éprouvé, et pas seulement celui sur la date.
  const finie={...seance('2026-10-05',6234,6236),status:'done'};
  assert.equal(c.learningSummary({...p.defaultState(),sessions:[finie]},'2026-09-29'),'Aucune séance prévue : définis ton objectif pour commencer.');
});

test('la date du résumé ne dépend pas de la locale',()=>{
  // Écrite à la main en JJ/MM/AAAA : `toLocaleDateString` rendrait autre chose
  // selon les données ICU présentes, et le banc ne pourrait plus comparer.
  const state={...p.defaultState(),sessions:[seance('2026-01-02',6234,6236)]};
  assert(c.learningSummary(state,'2026-01-01').includes('02/01/2026'));
});
