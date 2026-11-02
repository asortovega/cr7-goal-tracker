/**
 * CR7 Goal Tracker — zero-dependency Node.js server.
 * Run on Node 18+ with `node server.js`. Your API key stays on the SERVER.
 * Provider: API-Football v3 https://www.api-football.com/documentation_v3
 *
 * Important: This is a score-event tracker, not an official audited ledger.
 * Snapshot: 985 official senior goals through Oct 30, 2026.
 * New goals are appended from matches dated Oct 31, 2026 onward.
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const STORAGE = path.join(ROOT, 'data', 'tracker.json');
const SNAPSHOT = {
  goals: Number(process.env.BASELINE_GOALS || 985),
  clubSeason: Number(process.env.BASELINE_CLUB_GOALS || 9),
  calendarYear: Number(process.env.BASELINE_2026_GOALS || 28),
  cutoff: '2026-10-30',
  start: '2026-10-31',
  season: '2026/27',
  source: 'https://www.ronaldostats.app/',
  label: 'Verified snapshot · Oct 30, 2026'
};

// Deliberately partial (illustrative) historical examples, not an exhaustive goal log.
const HISTORICAL_GOALS = [
  {id:'archive-985', careerNumber:985, date:'2026-10-29', minute:'81', team:'Al Nassr', teamType:'club', opponent:'Al Kholood', competition:'Saudi Pro League', score:'5–3', tag:'Hat-trick', kind:'Goal', archived:true},
  {id:'archive-984', careerNumber:984, date:'2026-10-29', minute:'72', team:'Al Nassr', teamType:'club', opponent:'Al Kholood', competition:'Saudi Pro League', score:'5–3', tag:'Hat-trick', kind:'Goal', archived:true},
  {id:'archive-983', careerNumber:983, date:'2026-10-29', minute:'66', team:'Al Nassr', teamType:'club', opponent:'Al Kholood', competition:'Saudi Pro League', score:'5–3', tag:'Hat-trick', kind:'Goal', archived:true},
  {id:'archive-982', careerNumber:982, date:'2026-10-23', minute:'49', team:'Al Nassr', teamType:'club', opponent:'Al Faisaly', competition:'Saudi Pro League', score:'3–1', tag:'Disputed attribution', kind:'Goal', archived:true}
];

function readDotEnv() {
  const file = path.join(ROOT,'.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file,'utf8').split(/\r?\n/)) {
    const match=line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
    if (match && !line.trim().startsWith('#') && !process.env[match[1]]) {
      process.env[match[1]]=match[2].replace(/^['"]|['"]$/g,'');
    }
  }
}
readDotEnv();
const API_KEY = (process.env.API_FOOTBALL_KEY || '').trim();
const PLAYER_ID = Number(process.env.RONALDO_PLAYER_ID || 874);
const PORT = Number(process.env.PORT || 3000);
const MAX_DAILY_CALLS = Math.max(5, Number(process.env.MAX_DAILY_CALLS || 90));
const BASE_URL='https://v3.football.api-sports.io';
const LIVE_STATUSES=new Set(['1H','HT','2H','ET','BT','P','SUSP','INT','LIVE']);
const FINISHED=new Set(['FT','AET','PEN']);
const SKIPPED=new Set(['PST','CANC','ABD','AWD','WO','TBD']);
const saved=loadState();
const state={
  teams:saved.teams||null,
  fixtures:saved.fixtures||{},
  teamsUpdatedAt:saved.teamsUpdatedAt||0,
  fixturesUpdatedAt:saved.fixturesUpdatedAt||0,
  lastSuccess:saved.lastSuccess||null,
  rateDay:saved.rateDay||'',
  callsToday:saved.callsToday||0,
  nextPollAt:0,
  lastError:null,
  refreshing:null,
  lastManualRefresh:0
};

function loadState(){
  try{return JSON.parse(fs.readFileSync(STORAGE,'utf8'));}catch{return {};}
}
function saveState(){
  const stored={teams:state.teams, fixtures:state.fixtures,
    teamsUpdatedAt:state.teamsUpdatedAt, fixturesUpdatedAt:state.fixturesUpdatedAt,
    lastSuccess:state.lastSuccess,rateDay:state.rateDay,callsToday:state.callsToday};
  try{
    fs.mkdirSync(path.dirname(STORAGE),{recursive:true});
    const temp=STORAGE+'.tmp';
    fs.writeFileSync(temp,JSON.stringify(stored,null,2));
    fs.renameSync(temp,STORAGE);
  }catch(err){console.error('Cannot persist tracker state:',err.message);}
}
function dateOnly(d){return new Date(d).toISOString().slice(0,10);}
function todayUTC(){return dateOnly(Date.now());}
function addDays(d,n){const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10);}
function remainingBudget(){
  const today=todayUTC();
  if (state.rateDay!==today){state.rateDay=today;state.callsToday=0;}
  return Math.max(0,MAX_DAILY_CALLS-state.callsToday);
}
async function api(endpoint,params={}){
  if (!API_KEY) throw Error('API_FOOTBALL_KEY is missing. Add it to .env to enable real match updates.');
  if (remainingBudget()<=0) throw Error('Daily safety budget reached. Increase MAX_DAILY_CALLS if your API subscription permits.');
  const url=new URL(endpoint,BASE_URL);
  for(const [key,value] of Object.entries(params)) if(value!==undefined&&value!==null) url.searchParams.set(key,String(value));
  state.callsToday++;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url,{headers:{'x-apisports-key':API_KEY},signal:controller.signal});
    const result=await response.json();
    if (!response.ok) throw Error(`API-Football HTTP ${response.status}`);
    if(result.errors && (Array.isArray(result.errors)?result.errors.length:Object.keys(result.errors).length)){
      throw Error(`API-Football: ${JSON.stringify(result.errors).slice(0,200)}`);
    }
    if (!Array.isArray(result.response)) throw Error('API-Football returned an unexpected response');
    return result.response;
  }finally{clearTimeout(timer);saveState();}
}
function normalizedName(v){return String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');}
function selectTeam(rows,type){
  const choices=rows.filter(x=>x.team?.id);
  if(type==='club') return choices.find(x=>normalizedName(x.team.name)==='alnassr') || choices.find(x=>normalizedName(x.team.name).includes('alnassr'));
  return choices.find(x=>normalizedName(x.team.name)==='portugal'&&x.team.national===true)
    || choices.find(x=>normalizedName(x.team.name)==='portugal');
}
async function discoverTeams(){
  const [clubList,portugalList]=await Promise.all([
    api('/teams',{search:'Al Nassr'}),api('/teams',{search:'Portugal'})
  ]);
  const club=selectTeam(clubList,'club');
  const portugal=selectTeam(portugalList,'national');
  if(!club||!portugal) throw Error('Unable to identify Al Nassr and Portugal in API-Football. Set the team IDs in data/tracker.json or check your subscription.');
  state.teams={club:{id:club.team.id,name:club.team.name,logo:club.team.logo},
    national:{id:portugal.team.id,name:portugal.team.name,logo:portugal.team.logo}};
  state.teamsUpdatedAt=Date.now();saveState();
}
function upsertFixture(item){
  const id=String(item.fixture?.id||'');
  if(!id) return;
  const old=state.fixtures[id]||{};
  state.fixtures[id]={...old,fixture:item.fixture,teams:item.teams,goals:item.goals,league:item.league,
    events:Array.isArray(item.events)?item.events:old.events||[],
    detailsAt:Array.isArray(item.events)?Date.now():old.detailsAt||0};
}
async function syncFixtures(){
  const end=addDays(todayUTC(),30);
  const from=SNAPSHOT.start;
  const ids=[state.teams.club.id,state.teams.national.id];
  for(const team of ids){
    const rows=await api('/fixtures',{team,from,to:end});
    for(const fixture of rows)upsertFixture(fixture);
  }
  state.fixturesUpdatedAt=Date.now();saveState();
}
function kickoffMs(f){return Date.parse(f.fixture?.date||'');}
function isRelevantFixture(f){
  const ids=[state.teams?.club.id,state.teams?.national.id];
  return ids.includes(f.teams?.home?.id)||ids.includes(f.teams?.away?.id);
}
function needsDetail(f,now){
  if(!isRelevantFixture(f)||SKIPPED.has(f.fixture?.status?.short))return false;
  const kick=kickoffMs(f);
  if(!Number.isFinite(kick)||kick>now+60*1000)return false;
  const status=f.fixture?.status?.short;
  const age=now-(f.detailsAt||0);
  if(LIVE_STATUSES.has(status)||(now-kick < 4*3600*1000 && !FINISHED.has(status)))return age>100*1000;
  if(FINISHED.has(status))return !f.detailsAt||(age>24*3600*1000&&now-kick<3*86400000);
  // Late/missing fixture status can be rechecked near kickoff or within a day.
  return (now-kick<24*3600*1000)&&age>15*60*1000;
}
async function syncDetails(){
  const now=Date.now();
  const pending=Object.values(state.fixtures).filter(f=>needsDetail(f,now));
  // Up to 20 fixture IDs per request, as documented by API-Football.
  for(let offset=0;offset<pending.length;offset+=20){
    const ids=pending.slice(offset,offset+20).map(f=>f.fixture.id).join('-');
    const rows=await api('/fixtures',{ids});
    for(const fixture of rows){
      // Only accept detailed responses if the events array is present.
      upsertFixture(fixture);
      const savedFixture=state.fixtures[String(fixture.fixture.id)];
      if(Array.isArray(fixture.events)) savedFixture.detailsAt=Date.now();
    }
  }
  if(pending.length)saveState();
}
function teamTypeForFixture(f,teams=state.teams){
  if(f.teams?.home?.id===teams?.club.id||f.teams?.away?.id===teams?.club.id)return 'club';
  return 'national';
}
function matchedRonaldo(event){
  // The stable API-Football ID is the primary identifier.
  if(Number(event.player?.id)===PLAYER_ID)return true;
  // Fallback for coverage feeds that omit ids; reject other named Ronaldos.
  if(event.player?.id!=null)return false;
  return /^(cristiano(?:\s+ronaldo)?|c\.\s*ronaldo|ronaldo)$/i.test(String(event.player?.name||'').trim());
}
function acceptedGoals(f,teams=state.teams){
  const events=f.events||[];
  const found=[];
  const counts={};
  for(const event of events){
    if(String(event.type).toLowerCase()!=='goal'||!matchedRonaldo(event))continue;
    const detail=String(event.detail||'');
    if(/own goal|missed penalty/i.test(detail))continue;
    if(!/normal goal|penalty|goal/i.test(detail))continue;
    const elapsed=Number(event.time?.elapsed||0);
    const extra=Number(event.time?.extra||0);
    const group=`${elapsed}-${extra}`;
    counts[group]=(counts[group]||0)+1;
    const type=teamTypeForFixture(f,teams);
    const mine=teams?.[type];
    if(!mine)continue;
    const rival=f.teams?.home?.id===mine.id?f.teams?.away?.name:f.teams?.home?.name;
    const score=(f.goals?.home!=null&&f.goals?.away!=null)?`${f.goals.home}–${f.goals.away}`:'—';
    found.push({
      id:`${f.fixture.id}:${group}:${counts[group]}`,
      fixtureId:f.fixture.id,
      date:f.fixture.date,
      minute:`${elapsed}${extra?'+'+extra:''}`,
      team:mine.name, teamType:type,opponent:rival||'Opponent',
      competition:f.league?.name||'Match',score,
      kind:/penalty/i.test(detail)?'Penalty':'Goal',tag:null,archived:false
    });
  }
  // If the feed includes a Goal cancelled VAR event for this player, remove
  // the latest corresponding scorer event (where attribution is identifiable).
  for (const event of events){
    if(String(event.type).toLowerCase()!=='var'||!/goal cancelled/i.test(String(event.detail)))continue;
    if (!matchedRonaldo(event))continue;
    const index=found.findLastIndex(x=>Number(x.minute.split('+')[0])<=Number(event.time?.elapsed||0));
    if(index>=0)found.splice(index,1);
  }
  return found;
}
function currentGoals(){
  if(!state.teams)return [];
  const goals=[];
  for(const f of Object.values(state.fixtures)){
    if(!isRelevantFixture(f))continue;
    if(dateOnly(f.fixture?.date||new Date())<SNAPSHOT.start)continue;
    goals.push(...acceptedGoals(f));
  }
  return goals.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)||Number(a.minute.split('+')[0])-Number(b.minute.split('+')[0]));
}
function currentMatches(){
  if(!state.teams)return [];
  const now=Date.now();
  return Object.values(state.fixtures).filter(isRelevantFixture)
    .filter(f=>{
      const kick=kickoffMs(f);
      return Number.isFinite(kick) && kick > now-5*86400000 && kick < now+30*86400000;
    })
    .sort((a,b)=>{
      const aLive=LIVE_STATUSES.has(a.fixture.status?.short)?0:1;
      const bLive=LIVE_STATUSES.has(b.fixture.status?.short)?0:1;
      if(aLive!==bLive)return aLive-bLive;
      const aFuture=kickoffMs(a)>now?0:1;
      const bFuture=kickoffMs(b)>now?0:1;
      if(aFuture!==bFuture)return aFuture-bFuture;
      return aFuture===0?kickoffMs(a)-kickoffMs(b):kickoffMs(b)-kickoffMs(a);
    }).slice(0,6).map(f=>({
      id:f.fixture.id,date:f.fixture.date,home:f.teams.home.name,away:f.teams.away.name,
      homeLogo:f.teams.home.logo,awayLogo:f.teams.away.logo,
      homeGoals:f.goals?.home,awayGoals:f.goals?.away,
      competition:f.league?.name||'Football',status:f.fixture?.status?.short||'NS',
      minute:f.fixture?.status?.elapsed||null,teamType:teamTypeForFixture(f)
    }));
}
function scheduleNextPoll(){
  const now=Date.now();
  let live=false;
  let nextKickoff=Infinity;
  for(const f of Object.values(state.fixtures)){
    if(!isRelevantFixture(f)||SKIPPED.has(f.fixture?.status?.short))continue;
    const kick=kickoffMs(f);
    const minutes=(now-kick)/60000;
    if(LIVE_STATUSES.has(f.fixture?.status?.short)||(!FINISHED.has(f.fixture?.status?.short)&&minutes>=-3&&minutes<210))live=true;
    if(!FINISHED.has(f.fixture?.status?.short)&&kick>now)nextKickoff=Math.min(nextKickoff,kick);
  }
  const nextLive=now+120000; // About every two minutes in match windows.
  const nextIdle=now+30*60000;
  state.nextPollAt=live?nextLive:Math.min(nextIdle,nextKickoff-3*60000);
  if(state.nextPollAt<now+60000)state.nextPollAt=now+60000;
}
async function refresh(){
  if(!API_KEY)return;
  if(state.refreshing)return state.refreshing;
  if(Date.now()<state.nextPollAt)return;
  state.refreshing=(async()=>{
    try{
      if(!state.teams||Date.now()-state.teamsUpdatedAt>7*86400000)await discoverTeams();
      if(!state.fixturesUpdatedAt||Date.now()-state.fixturesUpdatedAt>6*3600000)await syncFixtures();
      await syncDetails();
      state.lastSuccess=new Date().toISOString();
      state.lastError=null;
    }catch(err){
      state.lastError=err.message;
      console.error('Tracker refresh:',err.message);
    }finally{scheduleNextPoll();saveState();}
  })();
  try{await state.refreshing;}finally{state.refreshing=null;}
}
function overview(){
  const newGoals=currentGoals();
  const increment=newGoals.length;
  const careerGoals=SNAPSHOT.goals+increment;
  const clubGoals=newGoals.filter(g=>g.teamType==='club').length;
  const yearGoals=newGoals.filter(g=>g.date.slice(0,4)==='2026').length;
  const goalLog=[...newGoals.map((g,i)=>({...g,careerNumber:SNAPSHOT.goals+i+1})).reverse(),...HISTORICAL_GOALS];
  const hasKey=Boolean(API_KEY);
  let mode=hasKey?'connected':'demo';
  if(hasKey&&state.lastError)mode='error';
  if(hasKey&&!state.lastSuccess&&!state.lastError)mode='loading';
  return {
    mode,statusMessage:!hasKey?'Preview only — add an API key to enable live tracking.':state.lastError||null,
    source:SNAPSHOT.source,snapshot:SNAPSHOT,
    lastChecked:state.lastSuccess,
    goals:careerGoals,to1000:Math.max(0,1000-careerGoals),
    clubSeason:SNAPSHOT.clubSeason+clubGoals,
    calendarYear:SNAPSHOT.calendarYear+yearGoals,
    addedSinceSnapshot:increment,
    recentGoals:goalLog.slice(0,30),
    matches:currentMatches(),
    teamNames:{club:state.teams?.club?.name||'Al Nassr',national:state.teams?.national?.name||'Portugal'},
    pollingNote:'Updated from API-Football while this server and the page are active; scores may be delayed and provider coverage may vary.',
    apiRemaining:hasKey?remainingBudget():null
  };
}
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer(async(req,res)=>{
  const pathname=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).pathname;
  if(req.method!=='GET'){
    res.writeHead(405,{'content-type':'application/json'}).end(JSON.stringify({error:'Method not allowed'}));return;
  }
  if(pathname==='/api/overview'){
    const wantsRefresh=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).searchParams.get('refresh')==='1';
    if(wantsRefresh&&API_KEY&&Date.now()-state.lastManualRefresh>5*60000){
      state.lastManualRefresh=Date.now();
      state.nextPollAt=0;
      state.fixturesUpdatedAt=0;
    }
    await refresh();
    res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
    res.end(JSON.stringify(overview()));return;
  }
  if(pathname==='/api/health'){
    res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({ok:true,configured:!!API_KEY}));return;
  }
  const target=path.resolve(PUBLIC,'.'+(pathname==='/'?'/index.html':pathname));
  if(!target.startsWith(PUBLIC+path.sep)){
    res.writeHead(403).end('Forbidden');return;
  }
  try{
    const st=fs.statSync(target);
    if(!st.isFile())throw Error('Not a file');
    res.writeHead(200,{'content-type':MIME[path.extname(target)]||'application/octet-stream',
      'cache-control':pathname.endsWith('.html')?'no-store':'public, max-age=3600'});
    fs.createReadStream(target).pipe(res);
  }catch{res.writeHead(404,{'content-type':'text/plain'}).end('Not found');}
});

if(require.main===module){
  server.listen(PORT,()=>{
    console.log(`\n⚽ CR7 Goal Tracker: http://localhost:${PORT}`);
    console.log(API_KEY?'Live API enabled (requests subject to subscription/coverage).':'Demo mode — add your API_FOOTBALL_KEY to .env');
  });
}
module.exports={server,acceptedGoals,normalizedName,selectTeam,SNAPSHOT};
