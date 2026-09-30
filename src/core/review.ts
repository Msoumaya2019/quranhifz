import {AppState, addDays, completeSession, markKnowledge, memorizedIds, postponeSession, ReviewEvent, ReviewGrade, todayLocal, touch} from './program';
import {juzs, quarters, Range, surahAt} from './quran';

export type ReviewCategory='recent'|'habitual'|'priority';
export type ReviewTask=Range&{id:string;category:ReviewCategory;label:string};
export type ReviewPlan={recent:ReviewTask[];habitual:ReviewTask[];priority:ReviewTask[];session:ReviewTask[];completeJuz:number;completeRub:number;completeNisf:number};

export const reviewsEnabled=(state:AppState)=>state.reviewSettings?.enabled!==false;
export const reviewCycleDays=(state:AppState)=>state.reviewSettings?.cycleDays??7;
const isKnown=(state:AppState,id:number)=>state.knowledge[id]==='perfect'||state.knowledge[id]==='review';
export const dayAge=(from:string,to:string)=>Math.round((Date.parse(`${to}T12:00:00Z`)-Date.parse(`${from}T12:00:00Z`))/86400000);

export function setReviewsEnabled(state:AppState,enabled:boolean,at=todayLocal()):AppState {
  if(reviewsEnabled(state)===enabled)return state;
  const settings={enabled,cycleDays:reviewCycleDays(state),...(enabled?{resumedAt:at}:{})};
  // Existing dates and markers are deliberately retained. Overdue habitual
  // work is capped by the planner when the user comes back.
  return touch({...state,reviewSettings:settings});
}

export function setReviewCycle(state:AppState,cycleDays:7|14|21|30,at=todayLocal()):AppState {
  if(reviewCycleDays(state)===cycleDays)return state;
  const due={...state.reviewDue};
  for(const id of Object.keys(due))if(due[id]<at)due[id]=at;
  return touch({...state,reviewSettings:{...state.reviewSettings,enabled:reviewsEnabled(state),cycleDays},reviewDue:due});
}

export function toggleDifficulty(state:AppState,id:number,at=todayLocal()):AppState {
  if(id<1||id>6236)return state;
  const markers={...state.difficultyMarkers};
  const current={...markers[id]};
  const action=current.user?'resolved':'marked';
  if(current.user)delete current.user;
  else current.user={createdAt:at};
  if(current.user||current.admin)markers[id]=current;
  else delete markers[id];
  return touch({...state,difficultyMarkers:markers,difficultyHistory:[...(state.difficultyHistory??[]),{verseId:id,date:at,origin:'user',action}]});
}

export function prepareReviewSchedule(state:AppState,at=todayLocal()):AppState {
  if(!reviewsEnabled(state))return state;
  const due={...state.reviewDue};
  const stable=memorizedIds(state).filter(id=>{
    const learned=state.memorizedAt?.[id];
    return !learned||dayAge(learned,at)>=3;
  }).sort((a,b)=>a-b);
  let additions=0;
  const stableSet=new Set(stable);
  const large=juzs.some(j=>{for(let id=j.start;id<=j.end;id++)if(!stableSet.has(id))return false;return true;});
  const assigned=new Set<number>();
  if(large)for(let i=0;i<quarters.length;i+=2){
    const first=quarters[i],second=quarters[i+1];
    if(!first||!second)continue;
    let complete=true;
    for(let id=first.start;id<=second.end;id++)if(!stableSet.has(id)){complete=false;break;}
    if(!complete)continue;
    const existing=stable.slice().filter(id=>id>=first.start&&id<=second.end&&due[id]).map(id=>due[id]);
    const date=existing.length?existing.sort()[0]:addDays(at,additions++%reviewCycleDays(state));
    for(let id=first.start;id<=second.end;id++){if(!due[id]||due[id]>date)due[id]=date;assigned.add(id);}
  }
  for(const id of stable)if(!due[id]){
    due[id]=addDays(at,additions++%reviewCycleDays(state));
  }
  return additions||assigned.size&&Object.keys(due).some(id=>due[id]!==state.reviewDue?.[id])?touch({...state,reviewDue:due}):state;
}

function grouped(ids:number[],category:ReviewCategory,large:boolean):ReviewTask[] {
  const selected=new Set(ids),tasks:ReviewTask[]=[];
  if(large&&category==='habitual')for(let i=0;i<quarters.length;i+=2){
    const first=quarters[i],second=quarters[i+1];
    if(!first||!second)continue;
    let complete=true;
    for(let id=first.start;id<=second.end;id++)if(!selected.has(id)){complete=false;break;}
    if(complete){tasks.push({id:`${category}-${first.start}-${second.end}`,start:first.start,end:second.end,category,label:`Nisf al-hizb ${i/2+1}`});for(let id=first.start;id<=second.end;id++)selected.delete(id);}
  }
  if(large&&category==='habitual')for(const quarter of quarters){
    let complete=true;
    for(let id=quarter.start;id<=quarter.end;id++)if(!selected.has(id)){complete=false;break;}
    if(complete){tasks.push({id:`${category}-${quarter.start}-${quarter.end}`,start:quarter.start,end:quarter.end,category,label:`Rub‘ ${quarter.number}`});for(let id=quarter.start;id<=quarter.end;id++)selected.delete(id);}
  }
  const rest=[...selected].sort((a,b)=>a-b);
  for(const id of rest){const last=tasks[tasks.length-1];if(last&&last.label==='Versets'&&last.end+1===id&&surahAt(last.start).number===surahAt(id).number){last.end=id;last.id=`${category}-${last.start}-${id}`;}else tasks.push({id:`${category}-${id}-${id}`,start:id,end:id,category,label:'Versets'});}
  return tasks.sort((a,b)=>a.start-b.start);
}

export function reviewPlan(state:AppState,at=todayLocal()):ReviewPlan {
  const known=memorizedIds(state),knownSet=new Set(known);
  const completeJuz=juzs.filter(j=>{for(let id=j.start;id<=j.end;id++)if(!knownSet.has(id))return false;return true;}).length;
  const completeRub=quarters.filter(q=>{for(let id=q.start;id<=q.end;id++)if(!knownSet.has(id))return false;return true;}).length;
  const completeNisf=Array.from({length:120},(_,i)=>({start:quarters[i*2].start,end:quarters[i*2+1].end})).filter(h=>{for(let id=h.start;id<=h.end;id++)if(!knownSet.has(id))return false;return true;}).length;
  const empty={recent:[],habitual:[],priority:[],session:[],completeJuz,completeRub,completeNisf};
  if(!reviewsEnabled(state))return empty;
  const reviewedToday=new Set((state.reviewHistory??[]).filter(event=>event.date===at).flatMap(event=>Array.from({length:event.end-event.start+1},(_,i)=>event.start+i)));
  const priorityIds=known.filter(id=>!!(state.difficultyMarkers?.[id]?.user||state.difficultyMarkers?.[id]?.admin)&&!reviewedToday.has(id));
  const recentIds=known.filter(id=>{const date=state.memorizedAt?.[id];return date&&dayAge(date,at)>=0&&dayAge(date,at)<=2&&!reviewedToday.has(id);});
  const recentDueIds=recentIds.filter(id=>dayAge(state.memorizedAt![id],at)>=1);
  const stable=known.filter(id=>{const date=state.memorizedAt?.[id];return !date||dayAge(date,at)>=3;});
  const dueIds=stable.filter(id=>(state.reviewDue?.[id]??at)<=at&&!reviewedToday.has(id));
  // At most one ordinary day plus one catch-up day; missed work stays due.
  const cap=Math.max(1,Math.ceil(stable.length/reviewCycleDays(state)))*2;
  dueIds.sort((a,b)=>(state.reviewDue?.[a]??at).localeCompare(state.reviewDue?.[b]??at)||a-b);
  const habitualCandidates=grouped(dueIds,'habitual',completeJuz>0);
  const habitual:ReviewTask[]=[];let ordinaryCount=0;
  for(const task of habitualCandidates){
    if(ordinaryCount>=cap)break;
    const size=task.end-task.start+1,remaining=cap-ordinaryCount;
    if(task.label==='Versets'&&size>remaining){habitual.push({...task,end:task.start+remaining-1,id:`habitual-${task.start}-${task.start+remaining-1}`});ordinaryCount+=remaining;break;}
    habitual.push(task);ordinaryCount+=size;
  }
  const priority=grouped(priorityIds,'priority',false),recent=grouped(recentIds,'recent',false),recentDue=grouped(recentDueIds,'recent',false);
  const seen=new Set<number>();
  const session=[...priority,...recentDue,...habitual].flatMap(task=>{
    const available:number[]=[];for(let id=task.start;id<=task.end;id++)if(!seen.has(id)){seen.add(id);available.push(id);}
    return grouped(available,task.category,false);
  });
  return {recent,habitual,priority,session,completeJuz,completeRub,completeNisf};
}

export function gradeReviewTask(state:AppState,task:ReviewTask,grade:ReviewGrade,at=todayLocal()):AppState {
  if(!reviewsEnabled(state))return state;
  const event:ReviewEvent={id:`${at}-${task.category}-${task.start}-${task.end}-${Date.now()}`,date:at,start:task.start,end:task.end,category:task.category,grade};
  const due={...state.reviewDue},markers={...state.difficultyMarkers},difficultyHistory=[...(state.difficultyHistory??[])];
  for(let id=task.start;id<=task.end;id++){
    if(task.category==='habitual'||due[id])due[id]=addDays(at,grade==='perfect'?reviewCycleDays(state):grade==='hesitant'?2:1);
    if(grade==='rework'&&!markers[id]?.user){markers[id]={...markers[id],user:{createdAt:at}};difficultyHistory.push({verseId:id,date:at,origin:'user',action:'marked'});}
    if(grade==='perfect'&&markers[id]?.user){const current={...markers[id]};delete current.user;if(current.admin)markers[id]=current;else delete markers[id];difficultyHistory.push({verseId:id,date:at,origin:'user',action:'resolved'});}
  }
  return touch({...state,reviewDue:due,difficultyMarkers:markers,difficultyHistory,reviewHistory:[...(state.reviewHistory??[]),event]});
}

/* ------------------------------------------------------------------ *
 * Les trois réponses de fin de passage
 * ------------------------------------------------------------------ */

/**
 * Ce que l'utilisateur déclare à la fin d'un passage.
 *
 * Trois réponses, et non deux : « je sais », « je l'ai travaillé mais je ne le
 * tiens pas », « je ne l'ai pas encore appris ». Les deux dernières replanifient
 * le passage de la même façon — il revient — mais elles ne disent pas la même
 * chose de son état, et c'est cet écart qui pilote la suite.
 */
export type SessionOutcome = 'learned' | 'toReview' | 'notYet';

export const sessionOutcomeLabels: Record<SessionOutcome, string> = {
  learned: 'Appris',
  toReview: 'À revoir',
  notYet: 'Pas encore appris',
};

/**
 * Enregistre la réponse de fin de passage.
 *
 * Chaque réponse correspond à **un** des états nommés dans `consolidation.ts`,
 * et c'est là que se lit la différence entre les deux dernières :
 *
 * | Réponse | État obtenu | Ce que cela change |
 * |---|---|---|
 * | `learned` | `recentlyLearned` | le passage est mémorisé, la consolidation J+1 est programmée |
 * | `toReview` | `struggling` | jamais compté comme appris, mais marqué difficile |
 * | `notYet` | `inProgress` | rien n'est enregistré contre le passage, il revient tel quel |
 *
 * `toReview` marque **verset par verset**, et ne retire jamais un marquage
 * existant : un passage déjà signalé comme difficile le reste. C'est ce
 * marquage — et lui seul — qui sépare « à revoir » d'un simple report ; sans
 * lui les deux réponses seraient indiscernables.
 */
export function finalizeSession(state: AppState, id: string, outcome: SessionOutcome, at = todayLocal()): AppState {
  const session = state.sessions.find(s => s.id === id);
  if (!session) return state;
  if (outcome === 'learned') return completeSession(state, id, true, at);
  if (outcome === 'notYet') return postponeSession(state, id, at);

  // Le passage n'est jamais considéré comme acquis : il reste `learning`, ce qui
  // le retire des passages mémorisés même s'il y figurait par ailleurs.
  let next = markKnowledge(state, session, 'learning');
  for (let verse = session.start; verse <= session.end; verse++) {
    if (next.difficultyMarkers?.[verse]?.user) continue;
    next = toggleDifficulty(next, verse, at);
  }
  return postponeSession(next, id, at);
}
