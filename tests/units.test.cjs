const test=require('node:test');
const assert=require('node:assert/strict');
const u=require('./build/core/units.js');
const q=require('./build/core/quran.js');

test('chaque page entière se nomme « Page N »',()=>{
  for(let page=1;page<=604;page++){
    const r=q.pageRange(page);
    assert.equal(u.describeRange(r).main,`Page ${page}`,`page ${page}`);
  }
});

test("chaque juz’ entier se nomme « Juz’ N », et le 30 « Juz’ ‘Amma »",()=>{
  for(const juz of q.juzs){
    const got=u.describeRange({start:juz.start,end:juz.end}).main;
    assert.equal(got,juz.number===30?"Juz’ ‘Amma":`Juz’ ${juz.number}`);
  }
});

test('chaque hizb entier se nomme « 1 hizb »',()=>{
  for(const h of q.hizbs)assert.equal(u.describeRange({start:h.start,end:h.end}).main,'1 hizb');
});

test('chaque nisf entier se nomme « 1 nisf »',()=>{
  for(const n of q.halves)assert.equal(u.describeRange({start:n.start,end:n.end}).main,'1 nisf');
});

test('chaque rub‘ entier se nomme « 1 rub‘ »',()=>{
  for(const r of q.quarters)assert.equal(u.describeRange({start:r.start,end:r.end}).main,'1 rub‘');
});

test('une poignée de versets reste en versets, jamais en hizb ni en juz’',()=>{
  const first=q.surahs[77].start; // An-Naba, verset 1
  const label=u.describeRange({start:first,end:first+15});
  assert.equal(label.main,'Versets 1 à 16');
  assert.equal(label.detail,q.surahAt(first).name);
  const small=u.describeRange({start:first,end:first+7});
  assert.equal(small.main,'Versets 1 à 8');
  assert(!/hizb|juz/i.test(small.main));
});

test('aucun libellé n’affiche de fraction',()=>{
  for(let id=1;id<=6236;id+=13){
    const end=Math.min(6236,id+9);
    for(const label of [u.describeRange({start:id,end}).main,u.describeVolume([id,end])]){
      assert(!/0[,.]\d/.test(label),`fraction dans « ${label} »`);
    }
  }
});

test('une demi-page n’est jamais présentée comme un rub‘ entier',()=>{
  const page=u.describeRange({start:q.pageRange(582).start,end:q.pageRange(582).end});
  assert.equal(page.main,'Page 582');
  const half=q.pageRange(582);
  const mid=Math.floor((half.start+half.end)/2);
  const partial=u.describeRange({start:half.start,end:mid});
  assert.notEqual(partial.main,'1 rub‘');
  assert(/^Versets \d+ à \d+$/.test(partial.main),partial.main);
});

test('describeVolume retient la plus grande unité entièrement couverte',()=>{
  const ids=(r)=>{const out=[];for(let i=r.start;i<=r.end;i++)out.push(i);return out;};

  const eight=ids({start:q.surahs[77].start,end:q.surahs[77].start+7});
  assert.equal(u.describeVolume(eight),'8 versets');

  assert.equal(u.describeVolume(ids(q.pageRange(582))),'Page 582');

  const twoPages=[...ids(q.pageRange(582)),...ids(q.pageRange(583))];
  assert.equal(u.describeVolume(twoPages),'2 pages');

  assert.equal(u.describeVolume(ids(q.quarters[0])),'1 rub‘');
  assert.equal(u.describeVolume(ids(q.hizbs[0])),'1 hizb');
  assert.equal(u.describeVolume(ids(q.juzs[0])),'1 juz’');
  assert.equal(u.describeVolume(ids(q.juzs[29])),"1 juz’");
  assert.equal(u.describeVolume([]),'0 verset');
});

test('describePassage ajoute la page quand le libellé ne la porte pas',()=>{
  assert.equal(u.describePassage(q.pageRange(582)),'Page 582');

  const first=q.surahs[77].start;
  assert.equal(u.describePassage({start:first,end:first+15}),'Versets 1 à 16 · page 582');

  const juz=q.juzs[29];
  assert.equal(u.describePassage({start:juz.start,end:juz.end}),'Juz’ ‘Amma');

  const twoPages={start:q.pageRange(582).start,end:q.pageRange(583).end};
  assert.equal(u.describePassage(twoPages),'2 pages');

  // Jamais de doublon : si le libellé porte déjà la page, on n'en rajoute pas.
  for(let page=1;page<=604;page+=37){
    assert(!/page.*page/i.test(u.describePassage(q.pageRange(page))),`page ${page}`);
  }
});

test('withPage complète un libellé qui ne porte pas la page, sans jamais la doubler',()=>{
  const first=q.surahs[77].start;
  const passage={start:first,end:first+15};

  // 1. Le libellé de l'application — `reference()` — ne dit pas OÙ se trouve
  //    le passage. C'est exactement ce que `withPage` ajoute.
  const ref=q.reference(passage);
  assert(!/page/i.test(ref),`« ${ref} » porte déjà une page : le cas ne prouverait rien`);
  assert.equal(u.withPage(ref,passage),`${ref} · page ${q.pageOf(first)}`);

  // 2. Un libellé qui porte déjà la page est rendu tel quel, jamais doublé.
  assert.equal(u.withPage('Page 582',q.pageRange(582)),'Page 582');

  // 3. Une plage à cheval sur deux pages les nomme toutes les deux.
  const twoPages={start:q.pageRange(582).start,end:q.pageRange(583).end};
  const from=q.pageOf(twoPages.start),to=q.pageOf(twoPages.end);
  assert.notEqual(from,to,'la plage doit franchir une frontière de page, sinon rien n’est éprouvé');
  assert.equal(u.withPage(q.reference(twoPages),twoPages),`${q.reference(twoPages)} · pages ${from} à ${to}`);
});

test('les unités dérivées sont cohérentes avec les quartiers',()=>{
  assert.equal(q.hizbs.length,60);
  assert.equal(q.halves.length,120);
  assert.equal(q.quarters.length,240);
  assert.equal(q.juzs.length,30);
  for(let i=0;i<60;i++){
    assert.equal(q.hizbs[i].start,q.quarters[i*4].start);
    assert.equal(q.hizbs[i].end,q.quarters[i*4+3].end);
  }
  for(let i=0;i<120;i++){
    assert.equal(q.halves[i].start,q.quarters[i*2].start);
    assert.equal(q.halves[i].end,q.quarters[i*2+1].end);
  }
});
