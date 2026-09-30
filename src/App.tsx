import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState as DeviceAppState, BackHandler, ImageBackground, Keyboard, Linking, PanResponder, Platform, Pressable, ScrollView, StatusBar, Switch, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTheme, Button, Card, CheckChoice, Choice, colors, Field, Label, Title, themeOptions } from './ui/theme';
import { accountState, addDays, AppState, beginnerPaces, dateKey, dayOf, defaultState, generateProgram, goalFromPreset, goalIds, GoalPreset, goalIsAlreadyKnown, goalPresetLabels, gradeRevision, intensivePaces, isRangeKnown, LearningDirection, markKnowledge, memorizedIds, paceLabels, pacePresets, PacePreset, partialKnownRanges, postponeSession, progress, resetAllProgress, seedInitialRevisions, Session, stats, todayLocal, toggleKnownRange, touch, validGoal, weekdays } from './core/program';
import { pageAfterSwipe } from './core/pageNavigation';
import { expand, hizbs, juzs, normalizeRanges, pageOf, pageRange, quarters, Range, reference, surahs, verseAt, verseId, verses } from './core/quran';
import { describePassage, withPage } from './core/units';
import { learningSummary, todayPlan } from './core/consolidation';
import { loadAccountState, loadState, saveState } from './services/storage';
import { changePassword, consumeAuthLink, currentUser, pullState, pushState, requestPasswordLink, resendSignupConfirmation, signIn, signOut, supabase, syncConfigured } from './services/sync';
import {MushafPage} from './MushafPage';
import {coranTestActif,LIBELLES_TAILLE,normaliserMushaf,normaliserTaille,TAILLES_MUSHAF} from './core/coranTestMode';
import {AdminScreen,FriendsScreen} from './SocialScreens';
import {ensureSocialProfile,FriendProfile,isSocialAdmin,mySocialProfile,publishSocialProgress,setSocialOnline,unreadMessageCount,updateSocialProfile,appliquerPseudoEnAttente,stagePseudo} from './services/social';
import {normaliserPseudo,pseudoAffiche,pseudoUtilisable,raisonPseudoRefuse} from './core/social';
import { Notifications, cancelAutomaticReminders, ensureNotificationPermission, notificationDestination, registerPushDevice, saveNotificationPreferences, scheduledReminderCounts, setAdminMessagePresentationEnabled, setCorrectionPresentationEnabled, setMessagePresentationEnabled, setProgressPresentationEnabled, testLocalNotification, unregisterPushDevice, updatePushPresence } from './services/notifications';
import {AudioCommand,PassageAudioPlayer} from './PassageAudioPlayer';
import {RecitationRecorder} from './RecitationRecorder';
import {myCorrectionMarkers,syncPendingRecitations} from './services/recitations';
import {RecitationsScreen} from './RecitationsScreen';
import {finalizeSession,gradeReviewTask,prepareReviewSchedule,reviewCycleDays,reviewPlan,reviewsEnabled,ReviewTask,sessionOutcomeLabels,SessionOutcome,setReviewCycle,setReviewsEnabled,toggleDifficulty} from './core/review';
import {chooseAvatar,removeAvatar,stageAvatar,syncStagedAvatar,uploadAvatar} from './services/avatars';
import {FriendAvatar} from './ui/FriendAvatar';
import {MessagingButton} from './ui/MessagingButton';
import {DailyScreen,HomeDailyCard} from './DailyContent';
import {DailyKind} from './services/dailyContent';

type Tab='Accueil'|'Coran'|'Programme'|'Progrès'|'Amis';
type Reader={range:Range;sessionId?:string;revisionId?:string;reviewTask?:ReviewTask;initialLanguage?:'ar'|'fr'};
const heroImages={classic:require('../assets/themes/emerald.png'),feminine:require('../assets/themes/rose.png'),lilac:require('../assets/themes/lilac.png'),night:require('../assets/themes/night.png')};
const section=(title:string)=><Label style={{fontWeight:'700',fontSize:19,marginBottom:10,marginTop:12}}>{title}</Label>;
const percent=(n:number)=>`${Math.round(n*100)} %`;
const dateText=(key:string)=>new Date(`${key}T12:00:00`).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
const fullDate=(key:string)=>new Date(`${key}T12:00:00`).toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit',year:'numeric'});

export default function App(){return <SafeAreaProvider><AppContent /></SafeAreaProvider>;}

function AppContent(){
  const [state,setState]=useState<AppState>(()=>loadState());
  const [tab,setTab]=useState<Tab>('Accueil');
  const [utilityView,setUtilityView]=useState<'profile'|'settings'|null>(null);
  const [reader,setReader]=useState<Reader|null>(null);
  const [readerFullscreen,setReaderFullscreen]=useState(false);
  const [page,setPage]=useState(1);
  const [masked,setMasked]=useState(false);
  const [revealed,setRevealed]=useState<number|null>(null);
  const [wizard,setWizard]=useState<number|null>(state.profile?.firstName?state.onboardingDone?null:0:-1);
  const [account,setAccount]=useState<string|null>(null);
  const [accountIntro,setAccountIntro]=useState<'checking'|'show'|'done'>('checking');
  const [notice,setNotice]=useState('');
  const [socialView,setSocialView]=useState<'friends'|'admin'|null>(null);
  const [reviewOpen,setReviewOpen]=useState(false);
  const [todayOpen,setTodayOpen]=useState(false);
  const [recitationsOpen,setRecitationsOpen]=useState(false);
  const [dailyView,setDailyView]=useState<DailyKind|null>(null);
  const [pendingRecitationId,setPendingRecitationId]=useState<string|null>(null);
  const [reviewOnly,setReviewOnly]=useState(false);
  const [admin,setAdmin]=useState(false);
  const [passwordRecovery,setPasswordRecovery]=useState(false);
  const [pendingLinkId,setPendingLinkId]=useState<string|null>(null);
  const [pendingInviteCode,setPendingInviteCode]=useState<string|null>(null);
  const [unreadCount,setUnreadCount]=useState(0);
  const [myAvatarPath,setMyAvatarPath]=useState<string|null>(null);
  const syncWarningShown=useRef(false);
  const today=todayLocal();
  useEffect(()=>{(async()=>{
    const permission=await Notifications.getPermissionsAsync();
    let granted=permission.granted||permission.ios?.status===Notifications.IosAuthorizationStatus.PROVISIONAL;
    if(!granted&&(await AsyncStorage.getItem('notifications-requested-on-device'))!=='yes'){
      granted=await ensureNotificationPermission(true);
      await AsyncStorage.setItem('notifications-requested-on-device','yes');
    }
    if(granted)setState(current=>{
      if(current.notifications?.permissionExplained)return current;
      const next=touch({...current,notifications:{...current.notifications,messages:current.notifications?.messages!==false,learning:false,permissionExplained:true}});
      saveState(next);return next;
    });
  })().catch(()=>{});},[state.notifications?.permissionExplained]);
  const update=(next:AppState)=>{setState(next);saveState(next);if(account){pushState(next).then(()=>{syncWarningShown.current=false;}).catch(()=>{if(!syncWarningShown.current){syncWarningShown.current=true;setNotice('Sauvegarde locale effectuée. Synchronisation en attente.');}});publishSocialProgress(next).catch(()=>{});}};
  const activateAccount=async(user:{id:string;email?:string})=>{
    setAccountIntro('done');
    AsyncStorage.setItem('account-intro-complete','yes').catch(()=>{});
    const remote=await pullState();
    const result=accountState(user.id,loadAccountState(user.id),remote);
    saveState(result.state);setState(result.state);setAccount(user.email??user.id);
    setWizard(result.state.profile?.firstName?result.state.onboardingDone?null:0:-1);
    if(result.shouldPush)await pushState(result.state);
    if(user.email)syncStagedAvatar(user.email).catch(()=>{});
    // Le pseudo choisi a l'inscription, si l'inscription n'avait pas encore de
    // session : on l'applique maintenant qu'il y a un compte a qui l'attribuer.
    if(user.email)await appliquerPseudoEnAttente(user.email);
    return result.state;
  };
  const leaveAccount=()=>{
    const fresh=defaultState();saveState(fresh);setState(fresh);setAccount(null);
    setReader(null);setReviewOpen(false);setRecitationsOpen(false);setPendingRecitationId(null);setSocialView(null);setUtilityView(null);setTab('Accueil');setWizard(-1);
  };
  useEffect(()=>{Promise.all([AsyncStorage.getItem('account-intro-complete'),supabase?.auth.getSession()]).then(([marker,session])=>{
    const existing=marker==='yes'||Boolean(session?.data.session||state.userId||state.profile?.firstName||state.onboardingDone);
    setAccountIntro(current=>current==='done'?'done':existing||!syncConfigured?'done':'show');
  }).catch(()=>setAccountIntro('done'));},[]);
  const resetAll=async()=>{
    const fresh=resetAllProgress(loadState());
    saveState(fresh);setState(fresh);setReader(null);setPage(1);setMasked(false);setRevealed(null);setTab('Accueil');setWizard(fresh.profile?.firstName?0:-1);
    setNotice('Apprentissage et révisions remis à zéro.');
    if(account)try{await pushState(fresh);await publishSocialProgress(fresh);}catch{setNotice('Remise à zéro effectuée sur ce téléphone. Synchronisation en attente.');}
  };
  useEffect(()=>{if(!state.profile?.firstName&&wizard===null)setWizard(-1);else if(!state.onboardingDone&&wizard===null)setWizard(0);},[]);
  useEffect(()=>{
    const open=(data:Record<string,unknown>|undefined)=>{const destination=notificationDestination(data);if(!destination)return;
      if(destination.kind==='program'){setReader(null);setWizard(null);setSocialView(null);setTab('Programme');}
      else if(destination.kind==='reviews'&&reviewsEnabled(loadState())){setReader(null);setWizard(null);setSocialView(null);setReviewOpen(true);}
      else if(destination.kind==='recitation'){setReader(null);setWizard(null);setSocialView(null);setPendingRecitationId(destination.recitationId);setRecitationsOpen(true);}
      else if('linkId' in destination&&typeof destination.linkId==='string')setPendingLinkId(destination.linkId);
      Notifications.clearLastNotificationResponseAsync().catch(()=>{});
    };
    Notifications.getLastNotificationResponseAsync().then(response=>{if(response)open(response.notification.request.content.data);}).catch(()=>{});
    const response=Notifications.addNotificationResponseReceivedListener(event=>open(event.notification.request.content.data));
    const tokens=Notifications.addPushTokenListener(()=>{if(loadState().notifications?.permissionExplained)registerPushDevice().catch(()=>{});});
    return()=>{response.remove();tokens.remove();};
  },[]);
  useEffect(()=>{if(account&&pendingLinkId){setReader(null);setWizard(null);setUtilityView(null);setTab('Amis');setSocialView('friends');}},[account,pendingLinkId]);
  useEffect(()=>{if(account&&pendingInviteCode){setReader(null);setWizard(null);setUtilityView(null);setTab('Amis');setSocialView('friends');}},[account,pendingInviteCode]);
  useEffect(()=>{setMessagePresentationEnabled(state.notifications?.messages!==false);},[state.notifications?.messages]);
  useEffect(()=>{setProgressPresentationEnabled(state.notifications?.sharedProgress===true);},[state.notifications?.sharedProgress]);
  useEffect(()=>{setCorrectionPresentationEnabled(state.notifications?.corrections!==false);},[state.notifications?.corrections]);
  useEffect(()=>{setAdminMessagePresentationEnabled(state.notifications?.adminMessages!==false);},[state.notifications?.adminMessages]);
  useEffect(()=>{cancelAutomaticReminders().catch(()=>{});},[]);
  useEffect(()=>{if(!state.onboardingDone||!reviewsEnabled(state))return;const next=prepareReviewSchedule(state);if(next!==state)update(next);},[state.onboardingDone,state.knowledge,state.memorizedAt,state.reviewSettings?.enabled,state.reviewSettings?.cycleDays]);
  useEffect(()=>{if(!account)return;
    const prefs=state.notifications;
    saveNotificationPreferences({messages:prefs?.messages!==false,friendRequests:prefs?.friendRequests!==false,sharedProgress:prefs?.sharedProgress===true,revision:false,corrections:prefs?.corrections!==false,adminMessages:prefs?.adminMessages!==false,messagePreview:prefs?.messagePreview!==false}).then(()=>{
      if(prefs?.permissionExplained&&(prefs.messages!==false||prefs.friendRequests!==false||prefs.sharedProgress===true||prefs.corrections!==false||prefs.adminMessages!==false))return registerPushDevice();
    }).catch(()=>{});
  },[account,state.notifications]);
  useEffect(()=>{if(!account){setUnreadCount(0);return;}const refresh=()=>unreadMessageCount().then(setUnreadCount).catch(()=>{});refresh();const timer=setInterval(refresh,15000);const channel=supabase?.channel('unread-private-messages').on('postgres_changes',{event:'INSERT',schema:'public',table:'friend_messages'},refresh).subscribe();const foreground=DeviceAppState.addEventListener('change',status=>{if(status==='active')refresh();});return()=>{clearInterval(timer);foreground.remove();if(channel)supabase?.removeChannel(channel);};},[account,socialView]);
  useEffect(()=>{if(!account)return;syncPendingRecitations().catch(()=>{});const listener=DeviceAppState.addEventListener('change',status=>{if(status==='active')syncPendingRecitations().catch(()=>{});});return()=>listener.remove();},[account]);
  useEffect(()=>{if(!account)return;const refresh=async()=>{
    const rows=await myCorrectionMarkers();const current=loadState(),markers={...current.difficultyMarkers};
    for(const key of Object.keys(markers))if(markers[key].admin){const own={...markers[key]};delete own.admin;if(own.user)markers[key]=own;else delete markers[key];}
    for(const row of rows)if(!row.resolved_at)markers[row.verse_id]={...markers[row.verse_id],admin:{createdAt:row.created_at,comment:row.comment??undefined}};
    if(JSON.stringify(markers)!==JSON.stringify(current.difficultyMarkers??{}))update(touch({...current,difficultyMarkers:markers}));
  };refresh().catch(()=>{});const listener=DeviceAppState.addEventListener('change',status=>{if(status==='active')refresh().catch(()=>{});});return()=>listener.remove();},[account,recitationsOpen]);
  useEffect(()=>{
    const handle=async(url:string)=>{try{const invite=url.match(/^coranmemoire:\/\/friend\/([A-Za-z0-9_-]+)$/);if(invite){setPendingInviteCode(invite[1]);setUtilityView('profile');setNotice('Connecte-toi pour accepter cette invitation.');return;}const user=await consumeAuthLink(url);if(!user)return;
      const restored=await activateAccount(user);
      const parsedLink=new URL(url);
      const linkType=new URLSearchParams(parsedLink.hash.replace(/^#/,'')).get('type')??parsedLink.searchParams.get('type');
      const recovering=linkType==='recovery';setPasswordRecovery(recovering);
      setWizard(recovering?null:restored.profile?.firstName?restored.onboardingDone?null:0:-1);setUtilityView('profile');
      setNotice(recovering?'Lien confirmé. Choisis maintenant un mot de passe.':'Adresse confirmée. Ton compte est prêt.');
    }catch(e:any){setNotice(`Lien de connexion : ${e.message}`);}};
    Linking.getInitialURL().then(url=>{if(url)handle(url);}).catch(()=>{});
    const subscription=Linking.addEventListener('url',event=>{handle(event.url);});
    return()=>subscription.remove();
  },[]);
  useEffect(()=>{currentUser().then(async user=>{if(!user)return;try{await activateAccount(user);}catch{const cached=loadAccountState(user.id);if(cached){saveState(cached);setState(cached);setAccount(user.email??user.id);setWizard(cached.profile?.firstName?cached.onboardingDone?null:0:-1);setAccountIntro('done');}}}).catch(()=>{});},[]);
  useEffect(()=>{supabase?.auth.getSession().then(({data:{session}})=>{if(!session&&loadState().userId)leaveAccount();}).catch(()=>{});},[]);
  useEffect(()=>{if(!account){setAdmin(false);setMyAvatarPath(null);return;}let active=true;
    (async()=>{try{const profile=await ensureSocialProfile();if(active){setMyAvatarPath(profile.avatar_path??null);setAdmin(await isSocialAdmin());await publishSocialProgress(loadState());await setSocialOnline(true);}}catch{}})();
    const timer=setInterval(()=>{if(DeviceAppState.currentState==='active')setSocialOnline(true).catch(()=>{});},45000);
    const listener=DeviceAppState.addEventListener('change',status=>{setSocialOnline(status==='active').catch(()=>{});if(status==='active'&&loadState().notifications?.permissionExplained)registerPushDevice().catch(()=>{});else updatePushPresence(null).catch(()=>{});});
    return()=>{active=false;clearInterval(timer);listener.remove();setSocialOnline(false).catch(()=>{});};
  },[account]);
  useEffect(()=>{if(!account||!state.profile?.firstName)return;
    ensureSocialProfile().then(profile=>profile.display_name===state.profile!.firstName?undefined:updateSocialProfile({...profile,display_name:state.profile!.firstName})).catch(()=>{});
  },[account,state.profile?.firstName]);
  const openReader=(r:Reader)=>{setReader(r);setReaderFullscreen(false);setPage(pageOf(r.range.start));setMasked(false);setRevealed(null);};
  const closeReader=()=>{if(reader){const latest=loadState();const verseId=pageOf(reader.range.start)===page?reader.range.start:pageRange(page).start;update(touch({...latest,lastRead:{page,verseId,readAt:new Date().toISOString()}}));}setReader(null);setReaderFullscreen(false);};
  const edgeBack=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,gesture)=>Platform.OS==='ios'&&gesture.x0<26&&gesture.dx>22&&Math.abs(gesture.dx)>Math.abs(gesture.dy)*1.4,
    onPanResponderRelease:(_,gesture)=>{if(gesture.dx<75)return;if(wizard!==null){if(wizard>0)setWizard(wizard-1);else if(state.onboardingDone)setWizard(null);return;}if(utilityView){setUtilityView(null);return;}if(dailyView){setDailyView(null);return;}if(todayOpen){setTodayOpen(false);return;}if(socialView){setSocialView(null);setPendingLinkId(null);return;}if(tab!=='Accueil')setTab('Accueil');},
  }),[wizard,socialView,utilityView,dailyView,tab,state.onboardingDone]);
  useEffect(()=>{const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{
    if(reader){closeReader();return true;}
    if(recitationsOpen){setRecitationsOpen(false);setPendingRecitationId(null);return true;}
    if(utilityView){setUtilityView(null);return true;}
    if(reviewOpen){setReviewOpen(false);return true;}
    if(socialView){setSocialView(null);setPendingLinkId(null);return true;}
    if(dailyView){setDailyView(null);return true;}
    if(tab!=='Accueil'&&wizard===null){setTab('Accueil');return true;}
    return false;
  });return()=>subscription.remove();},[reader,page,recitationsOpen,reviewOpen,socialView,utilityView,dailyView,tab,wizard]);
  const statsNow=stats(state,today),prog=progress(state);
  const todaySessions=state.sessions.filter(s=>s.date===today&&s.status==='todo');
  const due=reviewsEnabled(state)?state.revisions.filter(r=>r.due<=today):[];
  const allDone=state.sessions.filter(s=>s.status==='done').length;
  const finishEstimate=state.sessions.filter(s=>s.status==='todo').at(-1)?.date;
  applyTheme(state.theme??'lilac');
  return <SafeAreaView edges={readerFullscreen?['bottom']:['top','bottom']} style={{flex:1,backgroundColor:colors.cream}} {...(reader||socialView==='friends'||tab==='Amis'?{}:edgeBack.panHandlers)}><StatusBar hidden={readerFullscreen} />
    {!reader&&accountIntro==='done'&&wizard===null&&!reviewOpen&&!todayOpen&&!recitationsOpen&&socialView!=='admin'&&!dailyView&&<View style={{backgroundColor:colors.paper,borderBottomWidth:1,borderBottomColor:colors.line}}><View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:18,paddingTop:7,paddingBottom:5,gap:14}}>{utilityView?<Pressable accessibilityLabel="Retour" onPress={()=>setUtilityView(null)}><Label style={{fontSize:24}}>‹</Label></Pressable>:null}<Label style={{flex:1,fontSize:18,fontWeight:'800',color:colors.green}}>{utilityView==='profile'?'Profil':utilityView==='settings'?'Réglages':'Apprendre le Coran'}</Label><Pressable accessibilityRole="button" accessibilityLabel={state.profile?.firstName?`Ouvrir le profil de ${state.profile.firstName}`:"Ouvrir le profil"} onPress={()=>setUtilityView('profile')} style={{flexDirection:'row',alignItems:'center',gap:7,minHeight:44,minWidth:44}}><FriendAvatar name={state.profile?.firstName??""} path={myAvatarPath} size={34} /><Label style={{fontSize:13,fontWeight:'700',color:colors.green}}>Profil</Label></Pressable><Pressable accessibilityLabel="Ouvrir les réglages" onPress={()=>setUtilityView('settings')}><Label style={{fontSize:22,color:colors.green}}>⚙</Label></Pressable></View>{!utilityView&&<View style={{flexDirection:'row',justifyContent:'space-around'}}>{(['Accueil','Coran','Programme','Progrès','Amis'] as Tab[]).map(name=><Pressable key={name} accessibilityRole="tab" accessibilityState={{selected:tab===name}} onPress={()=>{setTab(name);setSocialView(null);}} style={{paddingVertical:11,paddingHorizontal:3,borderBottomWidth:tab===name?2:0,borderBottomColor:colors.green}}><Label style={{fontSize:12,fontWeight:tab===name?'700':'500',color:tab===name?colors.green:colors.muted}}>{name}</Label></Pressable>)}</View>}</View>}
    {accountIntro==='checking'?<View style={{flex:1,justifyContent:'center',alignItems:'center'}}><Label>Ouverture de l’application…</Label></View>:accountIntro==='show'?<AccountWelcome onAuthenticated={activateAccount} onContinue={()=>{setAccountIntro('done');AsyncStorage.setItem('account-intro-complete','yes').catch(()=>{});}} />:reader?<ReaderScreen reader={reader} page={page} setPage={setPage} masked={masked} setMasked={setMasked} revealed={revealed} setRevealed={setRevealed} onClose={closeReader} onShareRecitation={id=>{setPendingRecitationId(id);setReader(null);setRecitationsOpen(true);}} onReviewDone={(task,grade)=>{const next=gradeReviewTask(state,task,grade);update(next);const upcoming=reviewPlan(next).session[0];if(upcoming)openReader({range:upcoming,reviewTask:upcoming});else if(!reviewOnly&&todaySessions[0])openReader({range:todaySessions[0],sessionId:todaySessions[0].id});else closeReader();}} state={state} update={update} fullscreen={readerFullscreen} setFullscreen={setReaderFullscreen} />:
      wizard!==null?<Onboarding state={state} update={update} step={wizard} setStep={setWizard} onDone={()=>{setWizard(null);setTab('Accueil');}} />:
      recitationsOpen?<RecitationsScreen initialRecitationId={pendingRecitationId} onClose={()=>{setRecitationsOpen(false);setPendingRecitationId(null);}} />:
      utilityView?<ScrollView contentContainerStyle={{paddingHorizontal:18,paddingBottom:35}}><ProfileScreen mode={utilityView} state={state} update={update} account={account} onAuthenticated={activateAccount} onSignedOut={leaveAccount} onAvatarChanged={setMyAvatarPath} setNotice={setNotice} openKnowledge={()=>setWizard(0)} openGoal={()=>setWizard(1)} openFriends={()=>{setUtilityView(null);setTab('Amis');setSocialView('friends');}} openAdmin={()=>{setUtilityView(null);setSocialView('admin');}} openRecitations={()=>setRecitationsOpen(true)} admin={admin} passwordRecovery={passwordRecovery} setPasswordRecovery={setPasswordRecovery} onPasswordReady={()=>{if(!state.profile?.firstName)setWizard(-1);else if(!state.onboardingDone)setWizard(0);}} onReset={resetAll} /></ScrollView>:
      socialView==='friends'||tab==='Amis'?<FriendsScreen initialLinkId={pendingLinkId} initialCode={pendingInviteCode} shareText={`Mon objectif ${state.goal.label} est atteint à ${percent(prog.goal)}. Cette semaine, j’ai appris ${statsNow.week} versets.`} onUnreadChange={()=>unreadMessageCount().then(setUnreadCount).catch(()=>{})} onClose={()=>{setSocialView(null);setPendingLinkId(null);setPendingInviteCode(null);setTab('Accueil');}} />:
      socialView==='admin'?<AdminScreen onClose={()=>setSocialView(null)} />:
      dailyView?<DailyScreen initialKind={dailyView} onClose={()=>setDailyView(null)} />:
      todayOpen?<TodayScreen state={state} openReader={openReader} onClose={()=>setTodayOpen(false)} />:
      reviewOpen&&reviewsEnabled(state)?<ReviewScreen state={state} openReader={openReader} openRecitations={()=>setRecitationsOpen(true)} onClose={()=>setReviewOpen(false)} startSession={only=>{setReviewOnly(only);const task=reviewPlan(state).session[0];if(task)openReader({range:task,reviewTask:task});else if(!only&&todaySessions[0])openReader({range:todaySessions[0],sessionId:todaySessions[0].id});}} />:
      <>
        <ScrollView key={tab} contentContainerStyle={{paddingHorizontal:18,paddingBottom:30}}>
          {tab==='Accueil'&&<Home state={state} prog={prog} stat={statsNow} todaySessions={todaySessions} due={due} finishEstimate={finishEstimate} openReader={openReader} openReviews={()=>setReviewOpen(true)} setTab={setTab} openSettings={()=>setUtilityView('settings')} unreadCount={unreadCount} openMessages={()=>{if(!account){setUtilityView('profile');setNotice('Connecte-toi pour accéder à tes messages.');return;}setPendingLinkId(null);setTab('Amis');setSocialView('friends');}} openDaily={kind=>setDailyView(kind)} openToday={()=>setTodayOpen(true)} />}
          {tab==='Coran'&&<QuranScreen state={state} openReader={openReader} openToday={()=>setTodayOpen(true)} />}
          {tab==='Programme'&&<ProgramScreen state={state} update={update} openReader={openReader} openWizard={()=>setWizard(1)} openReviews={()=>setReviewOpen(true)} openToday={()=>setTodayOpen(true)} />}
          {tab==='Progrès'&&<ProgressScreen state={state} prog={prog} stat={statsNow} allDone={allDone} />}
        </ScrollView>
      </>}
    {notice?<Pressable accessibilityRole="alert" onPress={()=>setNotice('')} style={{position:'absolute',left:18,right:18,bottom:18,zIndex:50,padding:14,backgroundColor:colors.paper,borderWidth:1,borderColor:colors.gold,borderRadius:14,elevation:8,shadowColor:'#000',shadowOpacity:0.16,shadowRadius:8}}><Label style={{fontSize:14,fontWeight:'600'}}>{notice}  ×</Label></Pressable>:null}
  </SafeAreaView>;
}

function AccountWelcome({onAuthenticated,onContinue}:{onAuthenticated:(user:{id:string;email?:string})=>Promise<AppState>;onContinue:()=>void}){
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [pseudo,setPseudo]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [photoUri,setPhotoUri]=useState<string|null>(null);
  const refusPseudo=raisonPseudoRefuse(pseudo);
  const submit=async(register:boolean)=>{
    setBusy(true);setMessage('');
    try{
      if(register&&photoUri)await stageAvatar(email.trim(),photoUri);
      // Le pseudo part avec l'inscription. Si Supabase exige la confirmation du
      // courriel, il n'y a pas encore de session : le pseudo est mis de cote et
      // applique a la premiere connexion reussie.
      if(register)await stagePseudo(email.trim(),normaliserPseudo(pseudo));
      const user=await signIn(email.trim(),password,register);
      if(user){await appliquerPseudoEnAttente(email.trim());await onAuthenticated(user);return;}
      if(register)setMessage('Un courriel de confirmation t’a été envoyé. Ouvre le lien sur ce téléphone, puis commence ton programme.');
      else setMessage('Connexion impossible. Vérifie ton adresse et ton mot de passe.');
    }catch(error:any){setMessage(error?.message??'Une erreur est survenue. Réessaie.');}
    finally{Keyboard.dismiss();setBusy(false);}
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow:1,justifyContent:'center',paddingHorizontal:24,paddingVertical:30}}>
    <View style={{alignItems:'center',marginBottom:24}}><Label style={{fontSize:36,color:colors.green}}>۞</Label><Title>Bienvenue</Title><Label style={{textAlign:'center',color:colors.muted,marginTop:6}}>Crée ton compte pour retrouver ton apprentissage sur tous tes appareils.</Label></View>
    <Card>
      <Label style={{fontSize:18,fontWeight:'700',marginBottom:12}}>Créer mon compte</Label>
      <Field value={email} onChangeText={setEmail} placeholder="Adresse e-mail" keyboardType="email-address" autoCapitalize="none" />
      <Field value={password} onChangeText={setPassword} placeholder="Mot de passe (au moins 6 caractères)" secureTextEntry />
      <Field value={pseudo} onChangeText={setPseudo} placeholder="Pseudo, par exemple sarah.k" autoCapitalize="none" maxLength={21} />
      {pseudo.trim()
        ?<Label style={{fontSize:12,color:refusPseudo?colors.red:colors.green,marginBottom:8}}>{refusPseudo??`Ton pseudo : ${pseudoAffiche(pseudo)}`}</Label>
        :<Label style={{fontSize:12,color:colors.muted,marginBottom:8}}>Tes amis pourront t’ajouter avec ce pseudo, sans code d’invitation.</Label>}
      <Pressable onPress={()=>chooseAvatar().then(uri=>{if(uri)setPhotoUri(uri);}).catch(error=>setMessage(error?.message??'Photo indisponible.'))} style={{flexDirection:'row',alignItems:'center',gap:12,marginVertical:12}}><FriendAvatar name="Apprenant" uri={photoUri} size={44} /><Label style={{color:colors.green2}}>Ajouter une photo (facultatif)</Label></Pressable>
      <Button disabled={busy||!email.includes('@')||password.length<6||!pseudoUtilisable(pseudo)} onPress={()=>submit(true)}>Créer mon compte</Button>
      <Button secondary disabled={busy||!email.includes('@')||!password} onPress={()=>submit(false)}>J’ai déjà un compte · me connecter</Button>
      {message?<Label style={{marginTop:12,color:colors.text}}>{message}</Label>:null}
      {message.includes('confirmation')?<Button secondary small onPress={onContinue}>Commencer mon programme</Button>:null}
    </Card>
    <Pressable onPress={onContinue} style={{alignSelf:'center',padding:10,marginTop:10}}><Label style={{fontSize:12,color:colors.muted,textDecorationLine:'underline'}}>Continuer sans compte</Label></Pressable>
  </ScrollView>;
}

function Home({state,prog,stat,todaySessions,due,finishEstimate,openReader,openReviews,openToday,setTab,openSettings,unreadCount,openMessages,openDaily}:{state:AppState;prog:ReturnType<typeof progress>;stat:ReturnType<typeof stats>;todaySessions:Session[];due:AppState['revisions'];finishEstimate?:string;openReader:(r:Reader)=>void;openReviews:()=>void;setTab:(tab:Tab)=>void;openSettings:()=>void;unreadCount:number;openMessages:()=>void;openDaily:(kind:DailyKind)=>void;openToday:()=>void}){
  const theme=state.theme??'lilac';
  const last=state.lastRead;
  const lastVerse=last?.verseId??todaySessions[0]?.start??state.goal.ranges[0]?.start??1;
  const lastPage=last?.page??pageOf(lastVerse);
  const lastSurah=surahs[verseAt(lastVerse).surah-1];
  const resume=()=>openReader({range:{start:lastVerse,end:lastVerse}});
  const shortcut=(label:string,glyph:string,onPress:()=>void)=><Pressable key={label} onPress={onPress} accessibilityLabel={label} style={{flex:1,alignItems:'center'}}><View style={{height:54,width:54,borderRadius:15,backgroundColor:colors.soft,borderWidth:1,borderColor:colors.softBorder,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:27,color:colors.green}}>{glyph}</Text></View><Label style={{fontSize:11,color:colors.text,marginTop:6}}>{label}</Label></Pressable>;
  return <>
    <ImageBackground source={heroImages[theme]} resizeMode="cover" style={{height:260,marginHorizontal:-18,overflow:'hidden'}} imageStyle={{width:'100%',height:'100%'}}>
      <View style={{flexDirection:'row',alignItems:'center',paddingHorizontal:25,paddingTop:24}}><View style={{flex:1}}><Text style={{color:'white',fontSize:25,fontWeight:'800',textShadowColor:'#0006',textShadowRadius:4}}>Apprendre le Coran</Text><Text style={{color:'white',fontSize:13,marginTop:4,textShadowColor:'#0008',textShadowRadius:4}}>Bonjour{state.profile?.firstName?` ${state.profile.firstName}`:''}</Text></View><MessagingButton unreadCount={unreadCount} onPress={openMessages} /><Pressable accessibilityLabel="Ouvrir les réglages" onPress={openSettings} style={{padding:8}}><Text style={{fontSize:23,color:'white'}}>⚙</Text></Pressable></View>
    </ImageBackground>
    <Pressable onPress={resume} style={{backgroundColor:colors.paper,borderWidth:1,borderColor:colors.line,borderRadius:19,padding:18,marginTop:-46,marginBottom:16,elevation:5,shadowColor:colors.green,shadowOpacity:0.12,shadowRadius:8,shadowOffset:{width:0,height:4}}}>
      <View style={{flexDirection:'row',alignItems:'center'}}><View style={{flex:1}}><Label style={{fontWeight:'800',fontSize:17}}>Reprendre ma lecture</Label><Label style={{marginTop:10,fontSize:13}}>{lastSurah.name}</Label><Label style={{fontSize:12,color:colors.muted}}>Page {lastPage} · Verset {verseAt(lastVerse).ayah}</Label></View><View style={{width:70,height:79,borderRadius:22,backgroundColor:colors.green,borderWidth:2,borderColor:colors.gold,alignItems:'center',justifyContent:'center'}}><Text style={{color:colors.progress,fontSize:39}}>۞</Text></View></View>
      <View style={{flexDirection:'row',alignItems:'center',gap:8,marginTop:13}}><View style={{flex:1,height:7,backgroundColor:colors.soft,borderRadius:8}}><View style={{width:percent(prog.goal) as any,height:7,backgroundColor:colors.green2,borderRadius:8}} /></View><Label style={{fontSize:12,color:colors.green}}>{percent(prog.goal)}</Label></View>
    </Pressable>
    <View style={{flexDirection:'row',justifyContent:'space-between',gap:4,marginBottom:19}}>{[
      shortcut('Lecture','▣',resume),
      shortcut('Apprentissage','◇',()=>todaySessions[0]?openReader({range:todaySessions[0],sessionId:todaySessions[0].id}):setTab('Programme')),
      ...(reviewsEnabled(state)?[shortcut('Révisions','↻',openReviews)]:[]),
      shortcut('Traduction','文',()=>openReader({range:{start:lastVerse,end:lastVerse},initialLanguage:'fr'})),
      shortcut('Rappels','☀',()=>openDaily('rappel')),
    ]}</View>
    {section('Rappel & invocation du jour')}
    <HomeDailyCard onOpen={openDaily} />
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline'}}>{section('Mes objectifs')}<Pressable onPress={()=>setTab('Programme')}><Label style={{fontSize:12,color:colors.green}}>Voir tout</Label></Pressable></View>
    <Card style={{flexDirection:'row',alignItems:'center',gap:14}}><View style={{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:colors.soft}}><Text style={{color:colors.green2,fontSize:28}}>◎</Text></View><View style={{flex:1}}><Label style={{fontWeight:'700'}}>{state.goal.label}</Label><Label style={{fontSize:12,color:colors.muted,marginTop:3}}>{Math.round(prog.goal*100)} % de l’objectif · {Math.round(prog.quran*100)} % du Coran</Label><View style={{height:6,backgroundColor:colors.soft,borderRadius:6,marginTop:9}}><View style={{width:percent(prog.goal) as any,height:6,backgroundColor:colors.green2,borderRadius:6}} /></View></View></Card>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline'}}>{section('Dernières lectures')}<Pressable onPress={()=>setTab('Coran')}><Label style={{fontSize:12,color:colors.green}}>Voir tout</Label></Pressable></View>
    <Pressable onPress={resume}><Card style={{flexDirection:'row',alignItems:'center',gap:13}}><View style={{width:42,height:42,borderRadius:21,alignItems:'center',justifyContent:'center',backgroundColor:colors.surahBadge}}><Text style={{fontSize:23,color:colors.green}}>۞</Text></View><View style={{flex:1}}><Label style={{fontWeight:'700'}}>{lastSurah.name}</Label><Label style={{fontSize:12,color:colors.muted}}>Page {lastPage} · Verset {verseAt(lastVerse).ayah}</Label></View><View style={{width:32,height:32,borderRadius:16,backgroundColor:colors.green,alignItems:'center',justifyContent:'center'}}><Text style={{color:'white'}}>▶</Text></View></Card></Pressable>
    <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline'}}>{section('Aujourd’hui')}<Pressable onPress={openToday} accessibilityLabel="Programme du jour"><Label style={{fontSize:12,color:colors.green}}>Programme du jour</Label></Pressable></View>
    <Card>{todaySessions.length?<><Label style={{color:colors.muted,fontSize:13}}>PROGRAMME D’APPRENTISSAGE</Label>{todaySessions.map(s=><View key={s.id} style={{marginTop:9}}><Label style={{fontWeight:'700'}}>{reference(s)}</Label><Label style={{color:colors.muted,fontSize:13}}>{describePassage(s)}</Label></View>)}</>:<Label style={{color:colors.muted}}>Aucune nouvelle séance prévue aujourd’hui.</Label>}</Card>
    <Button disabled={!todaySessions.length} onPress={()=>todaySessions[0]&&openReader({range:todaySessions[0],sessionId:todaySessions[0].id})}>COMMENCER MON APPRENTISSAGE</Button>
    {reviewsEnabled(state)&&<Button secondary onPress={openReviews}>MES RÉVISIONS</Button>}
    <View style={{flexDirection:'row',gap:12,marginTop:18}}><Card style={{flex:1}}><Label style={{fontSize:25,fontWeight:'700',color:colors.green}}>{stat.weeklySessions}</Label><Label style={{fontSize:12,color:colors.muted}}>séances cette semaine</Label></Card><Card style={{flex:1}}><Label style={{fontSize:25,fontWeight:'700',color:colors.green}}>{stat.month}</Label><Label style={{fontSize:12,color:colors.muted}}>versets ce mois</Label></Card></View>
    <Card><Label style={{fontWeight:'700'}}>Fin estimée de l’objectif</Label><Label style={{color:colors.muted,marginTop:4}}>{finishEstimate?`Objectif atteint le ${fullDate(finishEstimate)}`:prog.goal>=1?'Objectif atteint':'Au-delà du programme généré'}</Label></Card>
  </>;
}

function TodayScreen({state,openReader,onClose}:{state:AppState;openReader:(r:Reader)=>void;onClose:()=>void}){
  const plan=todayPlan(state);
  const retard=plan.lateSessions?` · ${plan.lateSessions} séance${plan.lateSessions===1?'':'s'} en retard`:'';
  return <ScrollView contentContainerStyle={{padding:18,paddingBottom:55}}>
    <Pressable onPress={onClose} accessibilityLabel="Revenir" style={{paddingVertical:7}}><Label style={{fontSize:20}}>‹ Retour</Label></Pressable>
    <Title>Programme du jour</Title>
    <Label style={{color:colors.muted,marginBottom:14}}>{plan.totalVerses?`${plan.totalVerses} verset${plan.totalVerses===1?'':'s'} aujourd’hui${retard}.`:'Rien de prévu aujourd’hui.'}</Label>
    {plan.blocks.map(block=><Card key={block.kind}>
      <View style={{flexDirection:'row',alignItems:'baseline',justifyContent:'space-between'}}><Label style={{fontSize:18,fontWeight:'700',color:colors.green}}>{block.title}</Label><Label style={{fontSize:13,color:colors.muted}}>{block.verses} verset{block.verses===1?'':'s'}</Label></View>
      <Label style={{color:colors.muted,fontSize:13,marginTop:5}}>{block.hint}</Label>
      {block.tasks.length?<>{block.tasks.slice(0,5).map(task=><Pressable key={`${task.start}-${task.end}`} onPress={()=>openReader({range:task})} style={{paddingVertical:9,borderTopWidth:1,borderColor:colors.line,marginTop:7}}><Label>{withPage(describePassage(task),task)} ›</Label></Pressable>)}{block.tasks.length>5?<Label style={{color:colors.muted,fontSize:13,marginTop:7}}>… et {block.tasks.length-5} autre{block.tasks.length-5===1?'':'s'}.</Label>:null}</>:<Label style={{color:colors.muted,marginTop:9}}>Rien dans ce bloc pour l’instant.</Label>}
    </Card>)}
  </ScrollView>;
}

function ReviewScreen({state,openReader,openRecitations,onClose,startSession}:{state:AppState;openReader:(r:Reader)=>void;openRecitations:()=>void;onClose:()=>void;startSession:(only:boolean)=>void}){
  const plan=reviewPlan(state);
  const categories:[string,ReviewTask[],string][]=[
    ['Révisions prioritaires',plan.priority,'Les versets à retravailler, marqués par toi ou par le professeur.'],
    ['Révisions récentes',plan.recent,'Les versets appris pendant les trois derniers jours.'],
    ['Révisions habituelles',plan.habitual,`Cycle de ${reviewCycleDays(state)} jours. Les séances manquées reviennent progressivement.`],
  ];
  return <ScrollView contentContainerStyle={{padding:18,paddingBottom:55}}><Pressable onPress={onClose} accessibilityLabel="Revenir" style={{paddingVertical:7}}><Label style={{fontSize:20}}>‹ Retour</Label></Pressable><Title>Mes révisions</Title><Label style={{color:colors.muted,marginBottom:14}}>Un programme fondé sur les versets réellement mémorisés.</Label>
    <Card><Label style={{fontWeight:'700'}}>Mon suivi</Label><Label style={{color:colors.muted,marginTop:7}}>{memorizedIds(state).length} versets mémorisés · {plan.completeJuz} juz’ · {plan.completeRub} rub‘ · {plan.completeNisf} nisf</Label><Label style={{color:colors.muted,marginTop:4}}>{state.reviewHistory?.length??0} révisions effectuées · {Object.values(state.difficultyMarkers??{}).filter(marker=>marker.user||marker.admin).length} versets prioritaires</Label></Card>
    {categories.map(([title,tasks,description])=><Card key={title}><Label style={{fontSize:18,fontWeight:'700'}}>{title}</Label><Label style={{color:colors.muted,fontSize:13,marginTop:5}}>{description}</Label><Label style={{color:colors.green,fontWeight:'700',marginTop:8}}>{tasks.length} passage{tasks.length===1?'':'s'} {title==='Révisions récentes'?'en consolidation':'à revoir'}</Label>{tasks.slice(0,5).map(task=><Pressable key={task.id} onPress={()=>openReader({range:task,reviewTask:task})} style={{paddingVertical:9,borderTopWidth:1,borderColor:colors.line,marginTop:7}}><Label>{withPage(task.label==='Versets'?reference(task):`${task.label} · ${reference(task)}`,task)} ›</Label></Pressable>)}</Card>)}
    <Button disabled={!plan.session.length&&!state.sessions.some(s=>s.date===todayLocal()&&s.status==='todo')} onPress={()=>startSession(false)}>Commencer ma séance</Button>
    <Button secondary disabled={!plan.session.length} onPress={()=>startSession(true)}>Aujourd’hui, je souhaite seulement réviser</Button>
    <Button secondary onPress={openRecitations}>Mes récitations</Button>
  </ScrollView>;
}

// Carte « Apprentissage » de l'ecran du Coran. Elle porte le meme glyphe que le
// raccourci « Apprentissage » de l'accueil : un meme mot ne doit pas se dire de
// deux facons. Aucune taille de texte nouvelle — 28, 12 et 19 existent deja.
function LearningCard({state,openToday}:{state:AppState;openToday:()=>void}){
  return <Pressable onPress={openToday} accessibilityLabel="Apprentissage">
    <Card style={{flexDirection:'row',alignItems:'center',gap:14}}>
      <View style={{width:48,height:48,borderRadius:24,alignItems:'center',justifyContent:'center',backgroundColor:colors.soft}}><Text style={{color:colors.green,fontSize:28}}>◇</Text></View>
      <View style={{flex:1}}><Label style={{fontWeight:'700'}}>Apprentissage</Label><Label style={{fontSize:12,color:colors.muted,marginTop:3}}>{learningSummary(state)}</Label></View>
      <Label style={{fontSize:19,color:colors.green}}>›</Label>
    </Card>
  </Pressable>;
}

function QuranScreen({state,openReader,openToday}:{state:AppState;openReader:(r:Reader)=>void;openToday:()=>void}){
  const [query,setQuery]=useState('');
  const found=surahs.filter(s=>`${s.number} ${s.name} ${s.meaning}`.toLowerCase().includes(query.toLowerCase()));
  return <><View style={{paddingTop:12,paddingBottom:14}}><Title>Le Coran</Title><Label style={{color:colors.muted}}>Mushaf de Médine · Hafs ‘an ‘Âsim · 604 pages</Label></View>
    <LearningCard state={state} openToday={openToday} />
    <Field value={query} onChangeText={setQuery} placeholder="Chercher une sourate" />
    {found.map(s=><Pressable key={s.number} onPress={()=>openReader({range:{start:s.start,end:s.end}})}><Card style={{flexDirection:'row',alignItems:'center',gap:14,paddingVertical:12}}><View style={{width:36,height:36,borderRadius:18,backgroundColor:colors.surahBadge,alignItems:'center',justifyContent:'center'}}><Label style={{fontSize:13,color:colors.green}}>{s.number}</Label></View><View style={{flex:1}}><Label style={{fontWeight:'700'}}>{s.name}</Label><Label style={{color:colors.muted,fontSize:12}}>{s.meaning} · {s.count} versets</Label></View><Label style={{fontSize:19,color:colors.green}}>{s.arabic}</Label></Card></Pressable>)}
  </>;
}

function ProgramScreen({state,update,openReader,openWizard,openReviews,openToday}:{state:AppState;update:(s:AppState)=>void;openReader:(r:Reader)=>void;openWizard:()=>void;openReviews:()=>void;openToday:()=>void}){
  const [showAll,setShowAll]=useState(false);
  const future=state.sessions.filter(s=>s.status==='todo');
  return <><View style={{paddingTop:12,paddingBottom:14}}><Title>Mon programme</Title><Label style={{color:colors.muted}}>{state.goal.label} · {paceLabels[state.pace]} par séance{state.goal.direction==='fromNas'?' · depuis An-Nâs':''}</Label></View>
    <View style={{flexDirection:'row',gap:10,marginBottom:8}}><Pressable onPress={()=>{const next=state.sessions.find(s=>s.status==='todo');if(next)openReader({range:next,sessionId:next.id});}} style={{flex:1,padding:18,backgroundColor:colors.paper,borderWidth:1,borderColor:colors.line,borderRadius:18,alignItems:'center'}}><Label style={{fontSize:28,color:colors.green}}>▣</Label><Label style={{fontWeight:'700'}}>Apprentissage</Label><Label style={{fontSize:12,color:colors.muted,textAlign:'center'}}>Nouveaux versets à mémoriser</Label></Pressable>{reviewsEnabled(state)&&<Pressable onPress={openReviews} style={{flex:1,padding:18,backgroundColor:colors.soft,borderWidth:1,borderColor:colors.line,borderRadius:18,alignItems:'center'}}><Label style={{fontSize:28,color:colors.green}}>⟳</Label><Label style={{fontWeight:'700'}}>Révision</Label><Label style={{fontSize:12,color:colors.muted,textAlign:'center'}}>Passages déjà appris</Label></Pressable>}</View>
    <Button onPress={openToday}>Programme du jour</Button>
    <Button secondary onPress={openWizard}>Modifier l’objectif et le rythme</Button>
    {section('À venir')}
    {(showAll?future:future.slice(0,25)).map(s=><Card key={s.id}><Label style={{fontSize:12,color:colors.gold,fontWeight:'700',textTransform:'uppercase'}}>{dateText(s.date)}</Label><Label style={{fontWeight:'700',marginTop:5}}>{reference(s)}</Label><Label style={{color:colors.muted,fontSize:13}}>{describePassage(s)} · À faire</Label><View style={{flexDirection:'row',gap:8,marginTop:10}}><View style={{flex:1}}><Button small onPress={()=>openReader({range:s,sessionId:s.id})}>Ouvrir</Button></View><View style={{flex:1}}><Button small secondary onPress={()=>update(postponeSession(state,s.id))}>Reporter</Button></View></View></Card>)}
    {!future.length&&<Card><Label>Aucune séance à venir. Vérifie ton objectif ou tes jours d’apprentissage.</Label></Card>}
    {future.length>25&&!showAll&&<Button secondary onPress={()=>setShowAll(true)}>Voir toutes les séances</Button>}
    {section('Historique')}
    {state.sessions.filter(s=>s.status!=='todo').slice(-20).reverse().map(s=><Card key={s.id} style={{paddingVertical:11}}><Label style={{fontSize:13,color:colors.muted}}>{dateText(s.date)} · {s.status==='done'?'Terminé':'Reporté'}</Label><Label>{reference(s)}</Label></Card>)}
  </>;
}

function ProgressScreen({state,prog,stat,allDone}:{state:AppState;prog:ReturnType<typeof progress>;stat:ReturnType<typeof stats>;allDone:number}){
  const [view,setView]=useState<'Jour'|'Semaine'|'Mois'>('Semaine');
  const today=todayLocal();
  const completed=state.sessions.filter(s=>s.status==='done'&&s.completedAt);
  const count=(predicate:(s:Session)=>boolean)=>completed.filter(predicate).reduce((n,s)=>n+s.end-s.start+1,0);
  const localDate=(s:Session)=>s.completedDate??s.completedAt!.slice(0,10);
  const monday=(()=>{const d=new Date(`${today}T12:00:00`);d.setDate(d.getDate()-((d.getDay()+6)%7));return dateKey(d);})();
  const values=view==='Jour'
    ?Array.from({length:6},(_,i)=>({label:`${i*4}h`,value:count(s=>localDate(s)===today&&Math.floor(new Date(s.completedAt!).getHours()/4)===i)}))
    :view==='Semaine'
      ?Array.from({length:7},(_,i)=>{const d=new Date(`${monday}T12:00:00`);d.setDate(d.getDate()+i);const key=dateKey(d);return {label:weekdays[d.getDay()].slice(0,2),value:count(s=>localDate(s)===key)};})
      :Array.from({length:5},(_,i)=>({label:`${i*7+1}–${Math.min((i+1)*7,new Date(Number(today.slice(0,4)),Number(today.slice(5,7)),0).getDate())}`,value:count(s=>localDate(s).slice(0,7)===today.slice(0,7)&&Number(localDate(s).slice(8,10))>=i*7+1&&Number(localDate(s).slice(8,10))<=(i+1)*7)}));
  const max=Math.max(1,...values.map(v=>v.value));
  return <><View style={{paddingTop:12,paddingBottom:14}}><Title>Ma progression</Title><Label style={{color:colors.muted}}>Chaque verset validé compte une seule fois.</Label></View>
    <View style={{flexDirection:'row',gap:8,marginBottom:12}}>{(['Jour','Semaine','Mois'] as const).map(v=><View key={v} style={{flex:1}}><Button small secondary={view!==v} onPress={()=>setView(v)}>{v.toUpperCase()}</Button></View>)}</View>
    <Card><Label style={{color:colors.muted,fontSize:13}}>CORAN MÉMORISÉ</Label><Label style={{fontSize:32,fontWeight:'700',color:colors.green}}>{percent(prog.quran)}</Label><Label style={{color:colors.muted,marginTop:8,fontSize:13}}>OBJECTIF ATTEINT</Label><Label style={{fontSize:27,fontWeight:'700',color:colors.green}}>{percent(prog.goal)}</Label></Card>
    <Card><Label style={{fontWeight:'700',marginBottom:12}}>Versets validés</Label><View style={{height:110,flexDirection:'row',alignItems:'flex-end',gap:8}}>{values.map((v,i)=><View key={i} style={{flex:1,alignItems:'center'}}><View style={{height:Math.max(5,v.value/max*80),width:'72%',borderRadius:6,backgroundColor:colors.green2}} /><Label style={{fontSize:11,color:colors.muted,marginTop:5}}>{v.label}</Label></View>)}</View></Card>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{[[stat.today,'versets aujourd’hui'],[stat.week,'cette semaine'],[stat.month,'ce mois'],[stat.hizbs,'hizb terminés'],[stat.days,'jours d’apprentissage'],...(reviewsEnabled(state)?[[stat.revisions+(state.reviewHistory?.length??0),'révisions effectuées']]:[])].map(([n,l])=><Card key={String(l)} style={{width:'48%',minHeight:95,marginBottom:0}}><Label style={{fontSize:24,fontWeight:'700',color:colors.green}}>{n}</Label><Label style={{fontSize:12,color:colors.muted}}>{l}</Label></Card>)}</View>
    {section(`Historique · ${allDone} séances`)}
    {state.sessions.filter(s=>s.status==='done').slice(-30).reverse().map(s=><Card key={s.id} style={{paddingVertical:10}}><Label style={{fontSize:12,color:colors.muted}}>{s.completedDate??s.completedAt?.slice(0,10)}</Label><Label>{reference(s)}</Label></Card>)}
  </>;
}

function ProfileScreen({mode,state,update,account,onAuthenticated,onSignedOut,onAvatarChanged,setNotice,openKnowledge,openGoal,openFriends,openAdmin,openRecitations,admin,passwordRecovery,setPasswordRecovery,onPasswordReady,onReset}:{mode:'profile'|'settings';state:AppState;update:(s:AppState)=>void;account:string|null;onAuthenticated:(user:{id:string;email?:string})=>Promise<AppState>;onSignedOut:()=>void;onAvatarChanged:(path:string|null)=>void;setNotice:(v:string)=>void;openKnowledge:()=>void;openGoal:()=>void;openFriends:()=>void;openAdmin:()=>void;openRecitations:()=>void;admin:boolean;passwordRecovery:boolean;setPasswordRecovery:(v:boolean)=>void;onPasswordReady:()=>void;onReset:()=>Promise<void>}){
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false);
  const [newPassword,setNewPassword]=useState('');
  const [resetting,setResetting]=useState(false);
  const [firstName,setFirstName]=useState(state.profile?.firstName??'');
  const [photoUri,setPhotoUri]=useState<string|null>(null);
  const [friendProfile,setFriendProfile]=useState<FriendProfile|null>(null);
  useEffect(()=>{let active=true;setFriendProfile(null);if(account)mySocialProfile().then(profile=>{if(active)setFriendProfile(profile);}).catch(()=>{});return()=>{active=false;};},[account]);
  // La presentation retenue, ramenee a un mode qui existe encore : ni les choix
  // coches ni la case « suivre la recitation » ne peuvent reprendre un mode retire.
  const mushaf=normaliserMushaf(state.reader?.mushaf);
  // La loupe de « Coran Test ». Une valeur absente ou inconnue vaut la taille du
  // livre, c'est-a-dire la seule ou la page ne se rogne pas.
  const taille=normaliserTaille(state.reader?.mushafTaille);
  const setFriendPreference=async(key:'share_online'|'share_progress'|'share_location')=>{if(!friendProfile)return;const next={...friendProfile,[key]:!friendProfile[key]};await updateSocialProfile(next);setFriendProfile(next);};
  const [deviceNotificationsAllowed,setDeviceNotificationsAllowed]=useState(false);
  const notificationPrefs:NonNullable<AppState['notifications']>=state.notifications??{messages:true,learning:false};
  useEffect(()=>{Notifications.getPermissionsAsync().then(result=>{const granted=result.granted||result.ios?.status===Notifications.IosAuthorizationStatus.PROVISIONAL;setDeviceNotificationsAllowed(granted);if(granted&&!notificationPrefs.permissionExplained)update(touch({...state,notifications:{...notificationPrefs,permissionExplained:true}}));}).catch(()=>{});},[]);
  const setNotification=(key:'messages'|'learning'|'friendRequests'|'sharedProgress'|'revision'|'corrections'|'adminMessages'|'messagePreview',value:boolean)=>update(touch({...state,notifications:{...notificationPrefs,[key]:value}}));
  const notificationSwitch=(label:string,key:'messages'|'learning'|'friendRequests'|'sharedProgress'|'revision'|'corrections'|'adminMessages'|'messagePreview',fallback:boolean)=><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginTop:12,gap:12}}><Label style={{flex:1}}>{label}</Label><Switch accessibilityLabel={label} value={notificationPrefs[key]??fallback} onValueChange={value=>setNotification(key,value)} trackColor={{false:colors.line,true:colors.green2}} thumbColor={colors.paper} /></View>;
  useEffect(()=>setFirstName(state.profile?.firstName??''),[state.profile?.firstName]);
  const saveFirstName=()=>{const value=firstName.trim();if(value.length<2||value.length>40){setNotice('Saisis un prénom de 2 à 40 caractères.');return;}update(touch({...state,profile:{sex:state.profile?.sex??'Homme',firstName:value}}));setNotice('Prénom enregistré pour ton profil et tes invitations.');};
  const pickPhoto=async()=>{try{const uri=await chooseAvatar();if(!uri)return;setPhotoUri(uri);if(account){await uploadAvatar(uri);const profile=await mySocialProfile();setFriendProfile(profile);onAvatarChanged(profile.avatar_path??null);setNotice('Photo de profil enregistrée.');}}catch(error){if(account)setPhotoUri(null);setNotice(String(error));}};
  const deletePhoto=()=>Alert.alert('Supprimer ta photo ?', 'Ton avatar affichera la première lettre de ton prénom.',[{text:'Annuler',style:'cancel'},{text:'Supprimer',style:'destructive',onPress:()=>removeAvatar().then(()=>mySocialProfile()).then(profile=>{setFriendProfile(profile);onAvatarChanged(profile.avatar_path??null);setPhotoUri(null);setNotice('Photo supprimée.');}).catch(error=>setNotice(String(error)))}]);
  const confirmReset=()=>Alert.alert('Tout remettre à zéro ?','Tes connaissances, séances, révisions, statistiques et choix de programme seront effacés. Ton compte et les pages du Coran seront conservés. Cette action ne peut pas être annulée.',[
    {text:'Annuler',style:'cancel'},
    {text:'Tout remettre à zéro',style:'destructive',onPress:()=>{setResetting(true);onReset().catch((e:any)=>setNotice(`Réinitialisation impossible : ${e.message}`)).finally(()=>setResetting(false));}},
  ]);
  const confirmPreferenceReset=()=>Alert.alert('Réinitialiser les préférences ?', 'Le thème, l’affichage du Coran, les notifications, le cycle de révision et le partage avec les amis retrouveront leurs valeurs initiales. Les apprentissages et récitations seront conservés.',[
    {text:'Annuler',style:'cancel'},
    {text:'Réinitialiser',onPress:()=>{const defaults=defaultState();update(touch({...state,theme:defaults.theme,reader:defaults.reader,notifications:defaults.notifications,reviewSettings:defaults.reviewSettings}));if(friendProfile)updateSocialProfile({...friendProfile,share_online:false,share_location:false,share_progress:false}).then(()=>setFriendProfile({...friendProfile,share_online:false,share_location:false,share_progress:false})).catch(error=>setNotice(String(error)));setNotice('Préférences réinitialisées.');}},
  ]);
  const handleAuth=async(register:boolean)=>{setBusy(true);try{if(register&&photoUri)await stageAvatar(email.trim(),photoUri);const user=await signIn(email.trim(),password,register);if(user){await onAuthenticated(user);setNotice(register?'Compte créé. Configure ton nouvel apprentissage.':'Tes données de ce compte ont été retrouvées.');}else{if(register)onSignedOut();setNotice('Vérifie ton courriel pour confirmer le compte.');}}catch(e:any){setNotice(e.message??'Connexion impossible.');}finally{Keyboard.dismiss();setBusy(false);}};
  return <>{mode==='profile'&&<><View style={{paddingTop:12,paddingBottom:14}}><Title>Mon profil</Title><Label style={{color:colors.muted}}>Tes préférences et tes données</Label></View>
    <Card><Label style={{fontWeight:'700'}}>Mon prénom</Label><View style={{flexDirection:'row',alignItems:'center',gap:12,marginTop:10}}><FriendAvatar name={firstName||'Apprenant'} path={friendProfile?.avatar_path} uri={photoUri} size={64} /><View style={{flex:1}}><Button small secondary onPress={pickPhoto}>{account?'Choisir ou modifier ma photo':'Ajouter une photo (facultatif)'}</Button>{account&&friendProfile?.avatar_path?<Button small secondary onPress={deletePhoto}>Supprimer ma photo</Button>:null}</View></View><Label style={{color:colors.muted,fontSize:13,marginVertical:8}}>Ce prénom apparaît dans les invitations envoyées à tes amis.</Label><Field value={firstName} onChangeText={setFirstName} placeholder="Ton prénom" autoCapitalize="words" /><Button secondary onPress={saveFirstName}>Enregistrer mon prénom</Button><Label style={{fontWeight:'700',marginTop:16}}>Compte et synchronisation</Label>{!syncConfigured?<Label style={{color:colors.muted,fontSize:13,marginTop:7}}>Ajoute l’URL et la clé publique de ton projet Supabase dans le fichier .env pour activer le compte.</Label>:account?<><Label style={{color:colors.muted,marginVertical:8}}>{account}</Label><Button secondary onPress={async()=>{try{await pushState(state);setNotice('Données synchronisées.');}catch(e:any){setNotice(e.message);}}}>Synchroniser maintenant</Button><Button secondary onPress={async()=>{await setSocialOnline(false).catch(()=>{});await unregisterPushDevice().catch(()=>{});await signOut();onSignedOut();setNotice('Déconnecté. Les données de ce compte restent sauvegardées séparément sur ce téléphone.');}}>Se déconnecter</Button></>:<><Label style={{color:colors.muted,fontSize:13,marginVertical:8}}>Retrouve ta progression sur un autre téléphone.</Label><Field value={email} onChangeText={setEmail} placeholder="Adresse e-mail" keyboardType="email-address" /><Field value={password} onChangeText={setPassword} placeholder="Mot de passe" secureTextEntry /><Button disabled={busy||!email||!password} onPress={()=>handleAuth(false)}>Se connecter</Button><Button secondary disabled={busy||!email||password.length<6} onPress={()=>handleAuth(true)}>Créer un compte</Button><Button secondary disabled={busy||!email.includes('@')} onPress={async()=>{setBusy(true);try{await resendSignupConfirmation(email);setNotice('Nouveau courriel de confirmation envoyé. Ouvre ce nouveau lien sur le téléphone où l’application est installée.');}catch(e:any){setNotice(e.message);}finally{Keyboard.dismiss();setBusy(false);}}}>Renvoyer le courriel de confirmation</Button><Button secondary disabled={busy||!email.includes('@')} onPress={async()=>{setBusy(true);try{await requestPasswordLink(email);setNotice('Un lien vient de t’être envoyé. Ouvre-le sur ce téléphone après avoir installé la nouvelle version de l’application.');}catch(e:any){setNotice(e.message);}finally{Keyboard.dismiss();setBusy(false);}}}>Recevoir un lien pour créer ou changer mon mot de passe</Button></>}</Card>
    {passwordRecovery&&account?<Card><Label style={{fontWeight:'700'}}>Choisir mon mot de passe</Label><Label style={{color:colors.muted,fontSize:13,marginVertical:8}}>Utilise au moins 8 caractères. Ton mot de passe reste privé.</Label><Field value={newPassword} onChangeText={setNewPassword} placeholder="Nouveau mot de passe" secureTextEntry /><Button disabled={busy||newPassword.length<8} onPress={async()=>{setBusy(true);try{await changePassword(newPassword);setNewPassword('');setPasswordRecovery(false);setNotice('Mot de passe enregistré. Ton compte est prêt.');onPasswordReady();}catch(e:any){setNotice(e.message);}finally{Keyboard.dismiss();setBusy(false);}}}>Enregistrer mon mot de passe</Button></Card>:null}
    <Card><Label style={{fontWeight:'700'}}>Mes récitations</Label><Label style={{color:colors.muted,fontSize:13,marginTop:6}}>Réécouter mes enregistrements et consulter les corrections du professeur.</Label><Button secondary onPress={openRecitations}>Ouvrir mes récitations</Button></Card>
    <Card><Label style={{fontWeight:'700'}}>Connaissances</Label><Label style={{color:colors.muted,fontSize:13,marginVertical:8}}>Modifier les sourates, juz’, hizb et passages déjà appris.</Label><Button secondary onPress={openKnowledge}>Modifier mes connaissances</Button></Card>
    <Card><Label style={{fontWeight:'700'}}>Objectif et rythme</Label><Label style={{color:colors.muted,fontSize:13,marginVertical:8}}>{state.goal.label} · {paceLabels[state.pace]}</Label><Button secondary onPress={openGoal}>Modifier mon programme</Button></Card>
    <Card><Label style={{fontWeight:'700'}}>Apprentissage</Label><View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:10}}><Label style={{flex:1}}>Activer l’espace Révisions</Label><Switch accessibilityLabel="Activer l’espace Révisions" value={reviewsEnabled(state)} onValueChange={value=>update(setReviewsEnabled(state,value))} trackColor={{false:colors.line,true:colors.green2}} thumbColor={colors.paper} /></View>{reviewsEnabled(state)&&<><Label style={{color:colors.muted,fontSize:13,marginTop:12}}>Cycle des révisions habituelles</Label><View style={{flexDirection:'row',gap:5,marginTop:8}}>{([7,14,21,30] as const).map(days=><View key={days} style={{flex:1}}><Button small secondary={reviewCycleDays(state)!==days} onPress={()=>update(setReviewCycle(state,days))}>{days} j</Button></View>)}</View></>}</Card>
    <Card><Label style={{fontWeight:'700'}}>Amis et entraide</Label><Label style={{color:colors.muted,fontSize:13,marginVertical:8}}>Suivi partagé, messages et cercles privés.</Label>{friendProfile&&<><CheckChoice label="Afficher ma présence en ligne" selected={friendProfile.share_online} onPress={()=>setFriendPreference('share_online').catch(e=>setNotice(String(e)))} /><CheckChoice label="Partager ma progression avec mes amis" selected={friendProfile.share_progress} onPress={()=>setFriendPreference('share_progress').catch(e=>setNotice(String(e)))} /><CheckChoice label="Afficher mon passage actuel" selected={friendProfile.share_location} onPress={()=>setFriendPreference('share_location').catch(e=>setNotice(String(e)))} /></>}<Button onPress={openFriends}>Ouvrir mes amis</Button>{admin?<Button secondary onPress={openAdmin}>Modérer les discussions</Button>:null}</Card>
    </>}{mode==='settings'&&<>    <Card><Label style={{fontWeight:'700'}}>Apparence</Label><Label style={{color:colors.muted,fontSize:13,marginVertical:8}}>Choisis ton univers visuel.</Label>{themeOptions.map(option=>{const selected=(state.theme??'lilac')===option.key;return <Pressable key={option.key} accessibilityRole="radio" accessibilityState={{selected}} onPress={()=>update(touch({...state,theme:option.key}))} style={{borderWidth:selected?2:1,borderColor:selected?option.swatches[0]:colors.line,borderRadius:15,padding:11,marginBottom:9,backgroundColor:colors.paper,flexDirection:'row',alignItems:'center',gap:12}}><View style={{height:54,width:47,borderRadius:9,backgroundColor:option.swatches[2],borderWidth:1,borderColor:option.swatches[1],overflow:'hidden'}}><View style={{height:21,backgroundColor:option.swatches[0]}} /><View style={{height:20,marginHorizontal:6,marginTop:-5,borderRadius:4,backgroundColor:option.swatches[2],borderColor:option.swatches[1],borderWidth:1}} /></View><View style={{flex:1}}><Label style={{fontWeight:'700'}}>{option.name}</Label><Label style={{fontSize:12,color:colors.muted}}>{option.description}</Label><View style={{flexDirection:'row',gap:5,marginTop:5}}>{option.swatches.map(swatch=><View key={swatch} style={{width:13,height:13,borderRadius:7,backgroundColor:swatch,borderWidth:1,borderColor:'#0002'}} />)}</View></View><Label style={{fontSize:20,color:selected?colors.green2:colors.muted}}>{selected?'◉':'○'}</Label></Pressable>})}</Card>
    <Card><Label style={{fontWeight:'700'}}>Affichage du Coran</Label><Label style={{color:colors.muted,fontSize:13,marginVertical:8}}>Choisis la présentation arabe des pages.</Label><Choice label="Moushaf de Médine" subtitle="Le Coran traditionnel, avec sa mise en page classique." selected={mushaf==='traditional'} onPress={()=>update(touch({...state,reader:{mushaf:'traditional',followAudio:state.reader?.followAudio!==false}}))} /><Choice label="Lecture simplifiée" subtitle="Lecture verset par verset, avec les règles de Tajweed en couleur." selected={mushaf==='tajweed'} onPress={()=>update(touch({...state,reader:{mushaf:'tajweed',followAudio:state.reader?.followAudio!==false}}))} />{coranTestActif&&<Choice label="Coran Test" subtitle="La page du Moushaf, versets placés comme sur l’imprimé, règles de Tajweed en couleur. Connexion nécessaire." selected={mushaf==='tajweedPages'} onPress={()=>update(touch({...state,reader:{mushaf:'tajweedPages',followAudio:state.reader?.followAudio!==false}}))} />}{coranTestActif&&mushaf==='tajweedPages'&&<View style={{marginTop:4}}><Label style={{fontWeight:'700'}}>Taille du texte</Label><Label style={{color:colors.muted,fontSize:13,marginVertical:6}}>La page garde les proportions du livre ; seule la loupe change, donc les versets ne se déplacent pas.</Label>{TAILLES_MUSHAF.map(item=><Choice key={item} label={LIBELLES_TAILLE[item]} selected={taille===item} onPress={()=>update(touch({...state,reader:{mushaf:'tajweedPages',followAudio:state.reader?.followAudio!==false,mushafTaille:item}}))} />)}</View>}<View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:8}}><Label style={{flex:1}}>Suivre automatiquement la récitation sur la page suivante</Label><Switch value={state.reader?.followAudio!==false} onValueChange={value=>update(touch({...state,reader:{mushaf,followAudio:value}}))} trackColor={{false:colors.line,true:colors.green2}} thumbColor={colors.paper} /></View></Card>
<Card>
      <Label style={{fontWeight:'700'}}>Notifications</Label>
      {!deviceNotificationsAllowed?<>
        <Label style={{color:colors.muted,fontSize:13,marginTop:8}}>Les notifications t’avertissent des messages, invitations, corrections et rappels personnels envoyés par le professeur.</Label>
        <Button secondary onPress={()=>ensureNotificationPermission(true).then(granted=>{if(granted){setDeviceNotificationsAllowed(true);update(touch({...state,notifications:{...notificationPrefs,permissionExplained:true}}));setNotice('Notifications autorisées.');}else setNotice('Autorisation refusée. Tu peux la modifier dans les réglages du téléphone.');}).catch(()=>setNotice('Les notifications sont indisponibles sur ce téléphone.'))}>Autoriser les notifications sur ce téléphone</Button>
      </>:null}
      {notificationSwitch('Messages privés','messages',true)}
      {notificationSwitch('Demandes d’amis','friendRequests',true)}
      {notificationSwitch('Progression partagée par les amis','sharedProgress',false)}
      {notificationSwitch('Corrections de mes récitations','corrections',true)}
      {notificationSwitch('Rappels personnels du professeur','adminMessages',true)}
      {notificationSwitch('Afficher le contenu des messages','messagePreview',true)}
      <Label style={{color:colors.muted,fontSize:13,marginTop:12}}>Les rappels automatiques à 19 h sont désactivés. Le professeur peut envoyer des notifications personnalisées.</Label>
      <Button secondary small onPress={()=>testLocalNotification().then(()=>setNotice('Notification locale de test programmée dans 5 secondes.')).catch(e=>setNotice(`Test local impossible : ${e.message}`))}>Tester une notification sur ce téléphone</Button>
      <Button secondary small onPress={()=>scheduledReminderCounts().then(counts=>setNotice(`${counts.learning} ancien(s) rappel(s) quotidien(s) et ${counts.revision} rappel(s) de révision programmés sur ce téléphone.`)).catch(e=>setNotice(`Vérification impossible : ${e.message}`))}>Vérifier les rappels programmés</Button>
      {account?<Button secondary small onPress={()=>registerPushDevice().then(()=>setNotice('Jeton push enregistré. La réception dépend encore de Firebase ou APNs.')).catch(e=>setNotice(`Push indisponible : ${e.message}`))}>Vérifier le jeton push</Button>:null}
    </Card>
    <Card><Label style={{fontWeight:'700'}}>Tout remettre à 0</Label><Label style={{color:colors.muted,fontSize:13,marginVertical:8}}>Recommencer le questionnaire et effacer tout l’apprentissage et toutes les révisions. Ton prénom et ton thème seront conservés.</Label><Button secondary disabled={resetting} onPress={confirmReset}>Réinitialiser apprentissage et révisions</Button><Button secondary onPress={confirmPreferenceReset}>Réinitialiser mes préférences</Button></Card>
    <Card><Label style={{fontWeight:'600',fontSize:14,color:colors.muted}}>Sources du Coran</Label><Label style={{color:colors.muted,fontSize:13,marginTop:7}}>Texte Uthmani Hafs : Tanzil Project, copyright 2007–2021, licence CC BY 3.0. Texte reproduit sans modification.</Label><Pressable onPress={()=>Linking.openURL('https://tanzil.net')}><Label style={{color:colors.green2,textDecorationLine:'underline',marginTop:7}}>Voir Tanzil et les mises à jour ↗</Label></Pressable><Label style={{color:colors.muted,fontSize:13,marginTop:7}}>Division des pages : celle du Moushaf imprimé, chaque page s’arrêtant au dernier verset réellement imprimé ; les 604 pages ont été vérifiées, et elles se suivent sans trou ni recouvrement. Coran Test : pages, glyphes et police QCF V4 fournis par Quran Foundation, demandés page par page — au serveur du projet, ou à l’API publique api.quran.com lorsque ce serveur ne porte pas la fonction ; aucune page n’est recopiée dans l’application. Lecture simplifiée : annotations de cpfair sous CC BY 4.0 sur texte Tanzil Hafs 2017. Traduction française du sens : Rachid Maach, version 1.0.3, QuranEnc. Divisions juz’, hizb et rub‘ : Quran Meta. Les toumoun Hafs attendent une validation indépendante.</Label></Card>
  </>}</>;
}

function Onboarding({state,update,step,setStep,onDone}:{state:AppState;update:(s:AppState)=>void;step:number;setStep:(n:number|null)=>void;onDone:()=>void}){
  const [sex,setSex]=useState<'Homme'|'Femme'|null>(state.profile?.sex??null);
  const [firstName,setFirstName]=useState(state.profile?.firstName??'');
  const [partSurah,setPartSurah]=useState(''),[partStart,setPartStart]=useState(''),[partEnd,setPartEnd]=useState('');
  const [paceLevel,setPaceLevel]=useState<PacePreset>(state.pace==='halfPage'?'intermediate':intensivePaces.includes(state.pace)?'intensive':'beginner');
  const [kind,setKind]=useState<GoalPreset|'custom'>(()=>(Object.keys(goalPresetLabels) as GoalPreset[]).find(key=>goalPresetLabels[key]===state.goal.label)??'custom');
  const [direction,setDirection]=useState<LearningDirection>(state.goal.direction??'fromNas');
  const [selectedJuz,setSelectedJuz]=useState<number[]>([]),[selectedHizb,setSelectedHizb]=useState<number[]>([]),[selectedSurahs,setSelectedSurahs]=useState<number[]>([]);
  const [customSurah,setCustomSurah]=useState(''),[customStart,setCustomStart]=useState(''),[customEnd,setCustomEnd]=useState('');
  const [customRanges,setCustomRanges]=useState<Range[]>(state.goal.label==='Objectif personnalisé'||state.goal.label.startsWith('Juz’ ')||state.goal.label.startsWith('Hizb ')?state.goal.ranges:[]);
  const [error,setError]=useState('');
  const updateKnowledge=(next:AppState)=>update(state.onboardingDone?generateProgram(seedInitialRevisions(next)):next);
  const toggle=(list:number[],value:number,set:(v:number[])=>void)=>set(list.includes(value)?list.filter(x=>x!==value):[...list,value]);
  const addPartial=(goal:boolean)=>{
    const s=Number(goal?customSurah:partSurah),a=Number(goal?customStart:partStart),b=Number(goal?customEnd:partEnd);
    const first=verseId(s,a),last=verseId(s,b);
    if(!first||!last||first>last){setError('Indique une sourate et des versets valides.');return;}
    if(goal){setCustomRanges(normalizeRanges([...customRanges,{start:first,end:last}]));setCustomSurah('');setCustomStart('');setCustomEnd('');}
    else{updateKnowledge(markKnowledge(state,{start:first,end:last},'perfect'));setPartSurah('');setPartStart('');setPartEnd('');}
    setError('');
  };
  const selectedLevel=(r:Range)=>isRangeKnown(state,r);
  const goalAlreadyKnown=(preset:GoalPreset)=>goalIsAlreadyKnown(state,preset);
  const applyKnown=(range:Range)=>updateKnowledge(toggleKnownRange(state,range));
  const choosePaceLevel=(level:PacePreset)=>{setPaceLevel(level);update(touch({...state,pace:pacePresets[level].pace}));};
  // Le rythme de révision n'a de sens que si l'espace Révisions est actif : comme
  // partout ailleurs dans l'application, l'étape disparaît avec lui. Cette liste
  // est la seule source de vérité du nombre d'écrans de configuration — le
  // compteur de l'en-tête, le titre et le libellé du bouton en dérivent.
  const etapes=reviewsEnabled(state)?[0,1,2,3,4]:[0,1,2,3];
  const derniere=etapes[etapes.length-1];
  const next=()=>{
    setError('');
    if(step===-1){const value=firstName.trim();if(!sex){setError('Choisis Homme ou Femme pour continuer.');return;}if(value.length<2||value.length>40){setError('Saisis ton prénom, de 2 à 40 caractères.');return;}update(touch({...state,profile:{sex,firstName:value}}));if(state.onboardingDone)onDone();else setStep(0);return;}
    if(step===0){if(kind!=='custom'&&goalAlreadyKnown(kind)){const nextKind=(['lastTen','sabbih','amma','toYasin','half','all'] as GoalPreset[]).find(preset=>!goalAlreadyKnown(preset));setKind(nextKind??'custom');}setStep(1);return;}
    if(step===1){
      if(kind!=='custom'){const goal=goalFromPreset(kind,kind==='all'?direction:'fromNas');update(touch({...state,goal}));setStep(2);return;}
      const ranges=normalizeRanges([...selectedJuz.map(n=>juzs[n-1]),...selectedSurahs.map(n=>surahs[n-1]),...selectedHizb.map(n=>hizbs[n-1]),...customRanges]);
      if(!validGoal(ranges)){setError('Choisis au moins l’équivalent d’un hizb complet. Les passages déjà mémorisés comptent dans cet objectif.');return;}
      update(touch({...state,goal:{label:'Objectif personnalisé',ranges,direction:'fromStart'}}));setStep(2);return;
    }
    if(step===2){const allowed=paceLevel==='beginner'?beginnerPaces:paceLevel==='intermediate'?['halfPage']:intensivePaces;if(!allowed.includes(state.pace)){setError('Choisis une quantité parmi celles du niveau sélectionné.');return;}setStep(3);return;}
    if(!state.learningDays.length){setError('Sélectionne au moins un jour d’apprentissage.');return;}
    if(step<derniere){setStep(step+1);return;}
    const done=generateProgram(seedInitialRevisions(touch({...state,onboardingDone:true})));update(done);onDone();
  };
  return <><View style={{paddingHorizontal:18,paddingBottom:8}}><Label style={{fontSize:12,color:colors.gold,fontWeight:'700'}}>{step===-1?'BIENVENUE':`CONFIGURATION · ${step+1}/${etapes.length}`}</Label><Title>{step===-1?'Faisons connaissance':['Que connais-tu déjà ?','Quel est ton objectif ?','Quel rythme souhaites-tu ?','Quels jours souhaites-tu apprendre ?','À quelle fréquence réviser ?'][step]}</Title></View>
    <ScrollView contentContainerStyle={{paddingHorizontal:18,paddingBottom:15}}>
      {step===-1&&<><Label style={{color:colors.muted,marginBottom:14}}>Pour personnaliser ton parcours, indique d’abord si tu es un homme ou une femme, puis ton prénom. Seul ton prénom sera montré dans les invitations.</Label><Choice label="Homme" selected={sex==='Homme'} onPress={()=>setSex('Homme')} /><Choice label="Femme" selected={sex==='Femme'} onPress={()=>setSex('Femme')} />{sex&&<><Label style={{fontWeight:'700',marginTop:16,marginBottom:8}}>Quel est ton prénom ?</Label><Field value={firstName} onChangeText={setFirstName} placeholder="Ton prénom" autoCapitalize="words" /></>}</>}
      {step===0&&<>
        <Label style={{color:colors.muted,marginBottom:12}}>Coche les sourates que tu connais déjà par cœur. Ajoute aussi les passages dont tu ne connais qu’une partie. Tu pourras modifier cette liste plus tard.</Label>
        {section('Passages partiellement mémorisés')}
        <Field value={partSurah} onChangeText={setPartSurah} placeholder="Numéro de sourate (1–114)" keyboardType="number-pad" /><View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Field value={partStart} onChangeText={setPartStart} placeholder="Verset de début" keyboardType="number-pad" /></View><View style={{flex:1}}><Field value={partEnd} onChangeText={setPartEnd} placeholder="Verset de fin" keyboardType="number-pad" /></View></View><Button secondary onPress={()=>addPartial(false)}>Ajouter ce passage</Button>{partialKnownRanges(state).map(r=><Card key={`${r.start}-${r.end}`}><Label style={{fontSize:14}}>{reference(r)}</Label><Button small secondary onPress={()=>updateKnowledge(markKnowledge(state,r,'learning'))}>Retirer ce passage</Button></Card>)}
        {section('Sourates connues par cœur')}{surahs.map(s=><CheckChoice key={s.number} label={`${s.number}. ${s.name}`} subtitle={s.meaning} selected={selectedLevel(s)} onPress={()=>applyKnown(s)} />)}
        {section('Juz’ déjà connus')}{juzs.map(j=><CheckChoice key={j.number} label={`Juz’ ${j.number}`} selected={selectedLevel(j)} onPress={()=>applyKnown(j)} />)}
        {section('Hizb déjà connus')}{hizbs.map(h=><CheckChoice key={h.number} label={`Hizb ${h.number}`} selected={selectedLevel(h)} onPress={()=>applyKnown(h)} />)}
      </>}
      {step===1&&<>
        {([['lastTen','Je souhaite apprendre les petites sourates (les 10 dernières)'],['sabbih','Je souhaite apprendre le Hizb Sabbih'],['amma','Je souhaite apprendre le Juz’ ‘Amma'],['toYasin','Je souhaite apprendre jusqu’à la sourate Ya-Sîn'],['half','Je souhaite mémoriser la moitié du Coran'],['all','Je souhaite mémoriser tout le Coran'],['custom','Créer un objectif personnalisé']] as [typeof kind,string][]).filter(([value])=>value==='custom'||!goalAlreadyKnown(value)).map(([value,label])=><Choice key={value} label={label} selected={kind===value} onPress={()=>setKind(value)} />)}
        {(kind==='lastTen'||kind==='sabbih'||kind==='amma'||kind==='toYasin'||kind==='half')&&<Label style={{color:colors.muted,fontSize:13,marginBottom:8}}>Apprentissage depuis An-Nâs, en remontant sourate après sourate.</Label>}
        {kind==='all'&&<>{section('Par où commencer ?')}<Choice label="Depuis Al-Fatiha" subtitle="Sourates 1 à 114" selected={direction==='fromStart'} onPress={()=>setDirection('fromStart')} /><Choice label="Depuis An-Nâs" subtitle="Sourates 114 à 1 ; versets de chaque sourate dans l’ordre" selected={direction==='fromNas'} onPress={()=>setDirection('fromNas')} /></>}
        {kind==='custom'&&<>{section('Juz’')}{juzs.map(j=><CheckChoice key={j.number} label={`Juz’ ${j.number}`} selected={selectedJuz.includes(j.number)} onPress={()=>toggle(selectedJuz,j.number,setSelectedJuz)} />)}{section('Hizb')}{hizbs.map(h=><CheckChoice key={h.number} label={`Hizb ${h.number}`} selected={selectedHizb.includes(h.number)} onPress={()=>toggle(selectedHizb,h.number,setSelectedHizb)} />)}{section('Sourates')}{surahs.map(s=><CheckChoice key={s.number} label={`${s.number}. ${s.name}`} selected={selectedSurahs.includes(s.number)} onPress={()=>toggle(selectedSurahs,s.number,setSelectedSurahs)} />)}{section('Passage précis')}<Field value={customSurah} onChangeText={setCustomSurah} placeholder="Numéro de sourate" keyboardType="number-pad" /><View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Field value={customStart} onChangeText={setCustomStart} placeholder="Verset début" keyboardType="number-pad" /></View><View style={{flex:1}}><Field value={customEnd} onChangeText={setCustomEnd} placeholder="Verset fin" keyboardType="number-pad" /></View></View><Button secondary onPress={()=>addPartial(true)}>Ajouter le passage</Button>{customRanges.map((r,i)=><Label key={i}>{reference(r)}</Label>)}</>}
      </>}
      {step===2&&<><Label style={{color:colors.muted,marginBottom:12}}>Choisis d’abord ton niveau. Les quantités proposées correspondent ensuite à ce niveau. Tu choisiras les jours à l’étape suivante.</Label>{(Object.keys(pacePresets) as PacePreset[]).map(key=><Choice key={key} label={pacePresets[key].label} subtitle={pacePresets[key].description} selected={paceLevel===key} onPress={()=>choosePaceLevel(key)} />)}{paceLevel==='beginner'&&<>{section('Combien de versets par séance ?')}{beginnerPaces.map(p=><Choice key={p} label={paceLabels[p]} selected={state.pace===p} onPress={()=>update(touch({...state,pace:p}))} />)}</>}{paceLevel==='intermediate'&&<Card><Label>Une demi-page par séance.</Label></Card>}{paceLevel==='intensive'&&<>{section('Combien par séance ?')}{intensivePaces.map(p=><Choice key={p} label={paceLabels[p]} selected={state.pace===p} onPress={()=>update(touch({...state,pace:p}))} />)}</>}</>}
      {step===3&&<><Label style={{color:colors.muted,marginBottom:12}}>Les jours non sélectionnés restent libres pour les révisions.</Label>{[1,2,3,4,5,6,0].map(d=><CheckChoice key={d} label={weekdays[d]} selected={state.learningDays.includes(d)} onPress={()=>update(touch({...state,learningDays:state.learningDays.includes(d)?state.learningDays.filter(x=>x!==d):[...state.learningDays,d]}))} />)}</>}
      {step===4&&<><Label style={{color:colors.muted,marginBottom:12}}>Un passage appris revient le lendemain, puis à J+3 et à J+7. Passé ces paliers, il entre dans le cycle habituel que tu choisis ici.</Label>{([[7,'Chaque semaine'],[14,'Toutes les deux semaines'],[21,'Toutes les trois semaines'],[30,'Chaque mois']] as [7|14|21|30,string][]).map(([jours,label])=><Choice key={jours} label={label} subtitle={`Tous les ${jours} jours`} selected={reviewCycleDays(state)===jours} onPress={()=>update(setReviewCycle(state,jours))} />)}</>}
      {!!error&&<Label style={{color:colors.red,marginVertical:10}}>{error}</Label>}
    </ScrollView>
    <View style={{paddingHorizontal:18,paddingBottom:18,borderTopWidth:1,borderColor:colors.line,backgroundColor:colors.paper}}><View style={{flexDirection:'row',gap:10}}>{step>0&&<View style={{flex:1}}><Button secondary onPress={()=>setStep(step-1)}>Retour</Button></View>}<View style={{flex:2}}><Button onPress={next}>{step===derniere?'Créer mon programme':'Continuer'}</Button></View></View>{state.onboardingDone&&<Pressable onPress={onDone} style={{alignItems:'center',paddingTop:7}}><Label style={{color:colors.muted,fontSize:13}}>Fermer</Label></Pressable>}</View>
  </>;
}

function ReaderScreen({reader,page,setPage,masked,setMasked,revealed,setRevealed,onClose,onShareRecitation,onReviewDone,state,update,fullscreen,setFullscreen}:{reader:Reader;page:number;setPage:(n:number)=>void;masked:boolean;setMasked:(v:boolean)=>void;revealed:number|null;setRevealed:(n:number|null)=>void;onClose:()=>void;onShareRecitation:(id:string)=>void;onReviewDone:(task:ReviewTask,grade:'perfect'|'hesitant'|'rework')=>void;state:AppState;update:(s:AppState)=>void;fullscreen:boolean;setFullscreen:(value:boolean)=>void}){
  const {width}=useWindowDimensions();const imageWidth=Math.min(width-(fullscreen?8:28),600),imageHeight=(imageWidth-4)*3106/1920+4;
  const [playingVerseId,setPlayingVerseId]=useState<number|null>(null);
  const [language,setLanguage]=useState<'ar'|'fr'>(reader.initialLanguage??'ar'),[selectedVerse,setSelectedVerse]=useState<number|null>(null),[translationOptions,setTranslationOptions]=useState(false),[audioCommand,setAudioCommand]=useState<AudioCommand|null>(null),[commandSerial,setCommandSerial]=useState(0),[commandsVisible,setCommandsVisible]=useState(true);
  const readerScroll=useRef<ScrollView>(null);
  const showPage=(next:number)=>{setPage(next);};
  // Le retour en haut se fait une fois la nouvelle page posee. Le declencher dans
  // showPage l'appliquait a l'ancienne page : setPage ne fait que demander un
  // rendu, la mise a jour arrive au tour suivant. C'est ce qui laissait la page
  // suivante s'ouvrir au milieu, puis remonter d'un coup.
  useEffect(()=>{readerScroll.current?.scrollTo({y:0,animated:false});},[page]);
  const commandsTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>()=>{if(commandsTimer.current)clearTimeout(commandsTimer.current);},[]);
  useEffect(()=>{if(!fullscreen)return;commandsTimer.current=setTimeout(()=>setCommandsVisible(false),4500);return()=>{if(commandsTimer.current)clearTimeout(commandsTimer.current);};},[fullscreen]);
  const revealCommands=()=>{setCommandsVisible(true);if(commandsTimer.current)clearTimeout(commandsTimer.current);if(fullscreen)commandsTimer.current=setTimeout(()=>setCommandsVisible(false),4500);};
  const followAudio=(id:number|null)=>{setPlayingVerseId(id);if(id!==null&&state.reader?.followAudio!==false&&pageOf(id)!==page)showPage(pageOf(id));};
  const audioAction=(id:number,action:AudioCommand['action'])=>{setAudioCommand({serial:commandSerial+1,id,action});setCommandSerial(commandSerial+1);setSelectedVerse(null);};
  // Une seule source de verite pour la presentation affichee : le bandeau, le
  // libelle du verset recite et le rendu lisent tous cette valeur normalisee.
  // Sans cela, un mode desactive resterait annonce dans le bandeau.
  const mushaf=normaliserMushaf(state.reader?.mushaf);
  // La loupe de « Coran Test » se choisit dans les Reglages ; le lecteur ne fait
  // que lire la meme valeur, pour que le rendu et le reglage ne divergent pas.
  const taille=normaliserTaille(state.reader?.mushafTaille);
  const chooseMushaf=()=>Alert.alert('Affichage du Coran','Choisis une présentation.',[
    {text:'Moushaf de Médine',onPress:()=>update(touch({...state,reader:{mushaf:'traditional',followAudio:state.reader?.followAudio!==false}}))},
    {text:'Lecture simplifiée',onPress:()=>update(touch({...state,reader:{mushaf:'tajweed',followAudio:state.reader?.followAudio!==false}}))},
    ...(coranTestActif?[{text:'Coran Test',onPress:()=>update(touch({...state,reader:{mushaf:'tajweedPages',followAudio:state.reader?.followAudio!==false}}))}]:[]),
    {text:'Annuler',style:'cancel'},
  ]);
  const swipe=useMemo(()=>PanResponder.create({
    onMoveShouldSetPanResponder:(_,gesture)=>Math.abs(gesture.dx)>18&&Math.abs(gesture.dx)>Math.abs(gesture.dy)*1.5,
    onPanResponderTerminationRequest:()=>false,
    onPanResponderRelease:(_,gesture)=>{if(Platform.OS==='ios'&&gesture.x0<28&&gesture.dx>75){onClose();return;}const next=pageAfterSwipe(page,gesture.dx,gesture.dy);if(next!==page){showPage(next);setRevealed(null);}},
  }),[page,setPage,setRevealed,onClose]);
  const from=pageOf(reader.range.start),to=pageOf(reader.range.end);
  const targetVerses=Array.from({length:reader.range.end-reader.range.start+1},(_,i)=>reader.range.start+i);
  const visible=targetVerses.filter(id=>pageOf(id)===page);
  const nextReveal=revealed===null?visible[0]:visible.find(id=>id>revealed)??visible[0];
  const validate=(outcome:SessionOutcome)=>{if(!reader.sessionId)return;update(finalizeSession(state,reader.sessionId,outcome));onClose();};
  const grade=(value:'perfect'|'hesitant'|'errors'|'relearn')=>{if(!reader.revisionId)return;const next=gradeRevision(state,reader.revisionId,value);update(value==='relearn'?generateProgram(next):next);onClose();};
  return <View style={{flex:1}}>
    {/* En plein ecran, l'en-tete s'efface mais garde sa place. Le demonter changeait la
        hauteur de la zone de lecture : la page se recalculait et sautait, toute seule, au
        bout des 4,5 secondes. Une opacite nulle ne bouge rien. */}
    <View pointerEvents={fullscreen&&!commandsVisible?'none':'auto'} style={{paddingHorizontal:fullscreen?8:18,paddingBottom:8,paddingTop:fullscreen?8:0,flexDirection:'row',alignItems:'center',gap:8,backgroundColor:colors.cream,opacity:fullscreen&&!commandsVisible?0:1}}><Pressable accessibilityLabel="Revenir à l’écran précédent" onPress={onClose} style={{padding:8}}><Label style={{fontSize:22}}>‹</Label></Pressable><View style={{flex:1}}><Label style={{fontWeight:'700'}}>{reader.sessionId?'Séance du jour':reader.revisionId||reader.reviewTask?'Révision':'Le Coran'}</Label>{!fullscreen&&<Label style={{color:colors.muted,fontSize:12}}>{reference(reader.range)}</Label>}</View><Pressable accessibilityLabel="Changer le Moushaf" onPress={chooseMushaf} style={{padding:8,borderRadius:9,backgroundColor:colors.soft}}><Label style={{fontSize:12,color:colors.green}}>{mushaf==='tajweed'?'Simplifiée':mushaf==='tajweedPages'?'Coran Test':'Médine'} ⌄</Label></Pressable><Pressable accessibilityLabel={language==='ar'?'Voir la traduction française':'Voir le Coran en arabe'} onPress={()=>setLanguage(language==='ar'?'fr':'ar')} style={{padding:8,borderRadius:9,backgroundColor:colors.soft}}><Label style={{fontSize:13,color:colors.green}}>FR / عربي</Label></Pressable><Pressable accessibilityLabel={fullscreen?'Quitter le plein écran':'Plein écran'} onPress={()=>{if(!fullscreen){setFullscreen(true);revealCommands();}else{setFullscreen(false);setCommandsVisible(true);if(commandsTimer.current)clearTimeout(commandsTimer.current);}}} style={{padding:8}}><Label style={{fontSize:20,color:colors.green}}>{fullscreen?'⤢':'⛶'}</Label></Pressable></View>
    {/* La page est centree verticalement, et non posee en haut. L'ecran est plus haut que
        la page (rapport 1920 x 3106) : la poser en haut laissait toute la bande vide en
        bas, et le plein ecran la rendait plus visible encore. Le Math.max(100, …) qui
        entourait la marge du bas imposait 100 px dans les deux cas : la branche reservee
        au plein ecran ne servait a rien. */}
    <ScrollView ref={readerScroll} style={{flex:1}} contentContainerStyle={{flexGrow:1,alignItems:'center',justifyContent:'center',paddingBottom:fullscreen?35:100}}>
      {reader.sessionId&&!fullscreen&&<View style={{width:imageWidth,marginBottom:6}}><RecitationRecorder range={reader.range} onShare={item=>onShareRecitation(item.id)} /><Button secondary onPress={()=>{setCommandSerial(n=>n+1);setAudioCommand({serial:commandSerial+1,id:reader.range.start,action:'open'});}}>▶ Écouter mon passage par un récitateur</Button></View>}
      {/* Meme raison que l'en-tete : la barre de pages reste en place et s'efface. La
        demonter changeait la hauteur du contenu pendant qu'on le lisait. */}
      <View pointerEvents={fullscreen&&!commandsVisible?'none':'auto'} style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',width:imageWidth,marginBottom:7,opacity:fullscreen&&!commandsVisible?0:1}}><Pressable onPress={()=>{showPage(Math.max(1,page-1));setRevealed(null);}}><Label style={{fontSize:22,color:colors.green}}>‹</Label></Pressable><Label style={{fontSize:13,color:colors.muted}}>Page {page} / 604 {reader.sessionId||reader.revisionId?`· passage pages ${from}–${to}`:''}</Label><Pressable onPress={()=>{showPage(Math.min(604,page+1));setRevealed(null);}}><Label style={{fontSize:22,color:colors.green}}>›</Label></Pressable></View>
      <View {...swipe.panHandlers} style={{width:imageWidth}}><MushafPage page={page} width={imageWidth} height={imageHeight} mode={mushaf} taille={taille} language={language} playingVerseId={playingVerseId} difficultyIds={reviewsEnabled(state)?Object.keys(state.difficultyMarkers??{}).filter(id=>state.difficultyMarkers?.[id]?.user||state.difficultyMarkers?.[id]?.admin).map(Number):[]} sessionRange={reader.range} showSession={!!(reader.sessionId||reader.revisionId)} masked={masked} revealed={revealed} onVerseLongPress={id=>{setSelectedVerse(id);revealCommands();}} onBlankLongPress={()=>{setTranslationOptions(true);revealCommands();}} onTap={revealCommands} onRetourAuMoushaf={chooseMushaf} /></View>
      {mushaf==='tajweedPages'&&language==='ar'&&playingVerseId!==null&&<Label style={{width:imageWidth,color:colors.green,fontSize:13,marginTop:7,textAlign:'center'}}>Verset récité : {surahs[verseAt(playingVerseId).surah-1].name} · {verseAt(playingVerseId).ayah}</Label>}
      {!fullscreen&&<><Label style={{color:colors.muted,fontSize:12,marginTop:8}}>Glisse la page à gauche ou à droite pour la tourner.</Label>{!reader.sessionId&&<Card style={{width:imageWidth,marginTop:12}}><Button secondary onPress={()=>{setMasked(!masked);setRevealed(null);}}>{masked?'Voir la page':'Masquer les versets'}</Button>{masked&&<Button onPress={()=>setRevealed(nextReveal??visible[0]??null)}>Afficher le verset</Button>}</Card>}
      {reader.sessionId&&<View style={{width:imageWidth,marginTop:18}}>{section('Après ma séance')}<Button onPress={()=>validate('learned')}>{sessionOutcomeLabels.learned}</Button><Button secondary onPress={()=>validate('toReview')}>{sessionOutcomeLabels.toReview}</Button><Button secondary onPress={()=>validate('notYet')}>{sessionOutcomeLabels.notYet}</Button></View>}
      {reader.revisionId&&<View style={{width:imageWidth,marginTop:18}}>{section('Comment s’est passée la révision ?')}<Button onPress={()=>grade('perfect')}>Parfait, sans regarder</Button><Button secondary onPress={()=>grade('hesitant')}>Quelques hésitations</Button><Button secondary onPress={()=>grade('errors')}>Plusieurs erreurs</Button><Button secondary onPress={()=>grade('relearn')}>À réapprendre</Button></View>}</>}
      {reader.reviewTask&&reviewsEnabled(state)&&<View style={{width:imageWidth,marginTop:18}}>{section('Comment s’est passée la révision ?')}<Button onPress={()=>onReviewDone(reader.reviewTask!,'perfect')}>Parfait</Button><Button secondary onPress={()=>onReviewDone(reader.reviewTask!,'hesitant')}>Quelques hésitations</Button><Button secondary onPress={()=>onReviewDone(reader.reviewTask!,'rework')}>À retravailler</Button></View>}
      {!fullscreen&&!reader.sessionId&&<View style={{width:imageWidth,marginTop:18}}><RecitationRecorder range={reader.range} onShare={item=>onShareRecitation(item.id)} /></View>}
    </ScrollView>
    {selectedVerse!==null&&<View style={{position:'absolute',bottom:85,left:12,right:12,zIndex:8,backgroundColor:colors.paper,padding:14,borderRadius:17,borderWidth:1,borderColor:colors.line,elevation:8}}><Label style={{fontWeight:'700',marginBottom:6}}>Verset sélectionné : {surahs[verseAt(selectedVerse).surah-1].name} {verseAt(selectedVerse).ayah}</Label><Button small onPress={()=>audioAction(selectedVerse,'listen')}>▶ Écouter ce verset</Button><Button small secondary onPress={()=>audioAction(selectedVerse,'repeat')}>🔁 Répéter ce verset</Button><Button small secondary onPress={()=>audioAction(selectedVerse,'select')}>📖 Sélectionner un passage</Button>{reviewsEnabled(state)&&<Button small secondary onPress={()=>{update(toggleDifficulty(state,selectedVerse));setSelectedVerse(null);}}>{state.difficultyMarkers?.[selectedVerse]?.user?'Retirer des révisions prioritaires':'Marquer comme difficile'}</Button>}{reviewsEnabled(state)&&state.difficultyMarkers?.[selectedVerse]?.admin?.comment&&<Label style={{fontSize:12,color:colors.red}}>À retravailler — professeur : {state.difficultyMarkers[selectedVerse].admin!.comment}</Label>}<Pressable onPress={()=>setSelectedVerse(null)} style={{alignItems:'center',padding:5}}><Label style={{color:colors.muted,fontSize:12}}>Fermer</Label></Pressable></View>}
    {translationOptions&&<View style={{position:'absolute',bottom:85,left:12,right:12,zIndex:8,backgroundColor:colors.paper,padding:14,borderRadius:17,borderWidth:1,borderColor:colors.line}}><Label style={{fontWeight:'700'}}>Lecture</Label><Button small onPress={()=>{setLanguage(language==='ar'?'fr':'ar');setTranslationOptions(false);}}>Passer en {language==='ar'?'français':'arabe'}</Button><Button secondary small onPress={()=>setTranslationOptions(false)}>Fermer</Button></View>}
    <PassageAudioPlayer sessionRange={reader.range} page={page} command={audioCommand} onVerseChange={followAudio} fullscreen={fullscreen} hideLaunch={!!reader.sessionId} />
  </View>;
}
