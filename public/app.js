'use strict';
const $=id=>document.getElementById(id);
const app={data:null,filter:'all',notifications:false,seen:null,refreshing:false};
const STORE_ALERTS='cr7-alert-enabled-v1';
const STORE_GOALS='cr7-seen-goals-v1';

function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function httpsUrl(value){try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}}
function num(n){return Number(n||0).toLocaleString('en-US');}
function friendlyDate(iso,format='short'){
  if(!iso)return '—';
  const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso)?iso+'T12:00:00':iso);
  if(Number.isNaN(d.getTime()))return '—';
  return new Intl.DateTimeFormat('en-US',format==='short'?{month:'short',day:'numeric',year:'numeric'}:{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d);
}
function toast(message){const el=$('toast');el.textContent=message;el.classList.add('visible');clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.remove('visible'),4800);}
function setConnection(mode){
  const el=$('connectionBadge');
  el.className='connection-badge '+(mode==='demo'?'demo':mode==='error'?'error':'');
  $('connectionText').textContent=({connected:'LIVE DATA',demo:'DEMO SNAPSHOT',error:'FEED ISSUE',loading:'CONNECTING'})[mode]||'CHECKING';
}
function renderStats(d){
  $('careerGoals').textContent=num(d.goals);
  $('goalsRemaining').textContent=num(d.to1000);
  $('clubGoals').textContent=num(d.clubSeason);
  $('yearGoals').textContent=num(d.calendarYear);
  $('milestoneCurrent').textContent=num(d.goals);
  $('milestoneLeft').textContent=num(d.to1000);
  const pct=Math.min(100,Math.max(0,100*d.goals/1000));
  $('progressPercent').textContent=pct.toFixed(1)+'%';
  $('milestoneRing').style.setProperty('--pct',pct);
  $('goalSourceTag').textContent=d.mode==='demo'?'SNAPSHOT':d.mode==='error'?'FEED ISSUE':d.addedSinceSnapshot?'PROVISIONAL':'API READY';
  if(d.mode==='connected'&&d.lastChecked){
    $('lastUpdated').textContent='Checked '+friendlyDate(d.lastChecked,'long');
  }else if(d.mode==='error'){
    $('lastUpdated').textContent='Source unavailable · last data may be stale';
  }else{
    $('lastUpdated').textContent=d.snapshot.label+' · not real-time';
  }
}
function matchLabel(status,minute){
  if(['1H','HT','2H','ET','BT','P','SUSP','INT','LIVE'].includes(status))return {css:'live',text:minute?`● LIVE ${minute}'`:'● LIVE'};
  if(['FT','AET','PEN'].includes(status))return {css:'finished',text:'FULL TIME'};
  if(['PST','CANC','ABD'].includes(status))return {css:'',text:'POSTPONED'};
  return {css:'',text:'UPCOMING'};
}
function teamImage(url,name){
  const safe=httpsUrl(url);
  if(safe)return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(name)} badge" loading="lazy" onerror="this.style.display='none'">`;
  return `<span class="club-fallback" aria-hidden="true">${escapeHtml((name||'?').slice(0,1))}</span>`;
}
function renderMatches(d){
  const list=d.matches||[];
  if(!list.length){
    $('matchesContainer').innerHTML=`<div class="empty-panel"><div class="empty-icon">◷</div><strong>${d.mode==='demo'?'Match feed not connected':'No scheduled or recent matches found'}</strong><span>${d.mode==='demo'?'Add your API-Football key in the server .env file to load fixtures, scores, and goal events.':'Try again later. Fixtures depend on your provider’s coverage and update schedule.'}</span></div>`;
    return;
  }
  $('matchesContainer').innerHTML=list.map(m=>{
    const status=matchLabel(m.status,m.minute);
    const score=m.homeGoals==null||m.awayGoals==null?'VS':`${m.homeGoals} : ${m.awayGoals}`;
    const scoreClass=score==='VS'?' upcoming':'';
    return `<article class="match-card"><div class="match-header"><span>${escapeHtml(m.competition)}</span><span class="match-status ${status.css}">${status.text}</span></div><div class="match-matchup"><div class="club-side">${teamImage(m.homeLogo,m.home)}<span>${escapeHtml(m.home)}</span></div><strong class="match-score${scoreClass}">${escapeHtml(score)}</strong><div class="club-side">${teamImage(m.awayLogo,m.away)}<span>${escapeHtml(m.away)}</span></div></div><div class="match-footer">${escapeHtml(friendlyDate(m.date,'long'))} · ${m.teamType==='club'?'AL NASSR':'PORTUGAL'}</div></article>`;
  }).join('');
}
function renderGoals(d){
  const list=(d.recentGoals||[]).filter(g=>app.filter==='all'||g.teamType===app.filter);
  if(!list.length){
    $('goalsContainer').innerHTML=`<div class="empty-panel"><div class="empty-icon">⚽</div><strong>No goals in this selection</strong><span>New confirmed goal events will appear here when the feed detects them.</span></div>`;
  }else{
    $('goalsContainer').innerHTML=list.map(g=>{
      const extra=g.tag?`<span class="goal-tag">${escapeHtml(g.tag)}</span>`:'';
      return `<article class="goal-card"><div class="goal-mark"><small>GOAL NO.</small>${escapeHtml(g.careerNumber||'—')}</div><div class="goal-details"><div class="goal-topline"><span>${g.teamType==='club'?'AL NASSR':'PORTUGAL'}</span><span>·</span><span>${escapeHtml(g.competition||'MATCH')}</span></div><h3>vs ${escapeHtml(g.opponent)}</h3><div class="goal-subline">${escapeHtml(g.kind||'Goal')} · ${escapeHtml(g.score||'—')} ${extra}</div></div><div class="goal-extra"><strong class="minute">${escapeHtml(g.minute)}'</strong><span class="date">${escapeHtml(friendlyDate(g.date))}</span></div></article>`;
    }).join('');
  }
  $('logFootnote').textContent=d.mode==='demo'
    ?'Showing selected verified examples through Oct 30, 2026. This is not a complete match-by-match archive. The 49th-minute Oct 23 goal has disputed attribution.'
    :`New goals from Oct 31, 2026 onward are recorded from API-Football goal events. Historical cards are selected examples. Goal attribution may be corrected after review. ${d.addedSinceSnapshot||0} new goal(s) detected since the snapshot.`;
}
function checkNewGoals(d){
  const current=(d.recentGoals||[]).filter(g=>!g.archived).map(g=>g.id);
  if(app.seen===null){
    let previous=[];
    try{previous=JSON.parse(localStorage.getItem(STORE_GOALS)||'null');}catch{}
    app.seen=new Set(Array.isArray(previous)?previous:current);
  }
  const newlyFound=(d.mode==='connected')?(d.recentGoals||[]).filter(g=>!g.archived&&!app.seen.has(g.id)):[];
  current.forEach(id=>app.seen.add(id));
  try{localStorage.setItem(STORE_GOALS,JSON.stringify([...app.seen].slice(-500)));}catch{}
  if(!newlyFound.length||!app.notifications)return;
  for(const goal of newlyFound){
    const title='SIUUU! ⚽ Ronaldo scored!';
    const body=`${goal.team} vs ${goal.opponent} · ${goal.minute}' · career goal #${goal.careerNumber}`;
    toast(body);
    if('Notification'in window&&Notification.permission==='granted'){
      try{new Notification(title,{body,tag:`cr7-${goal.id}`});}catch{}
    }
  }
}
async function update(force=false){
  if(app.refreshing)return;
  app.refreshing=true;$('refreshBtn').disabled=true;
  try{
    const response=await fetch('/api/overview'+(force?'?refresh=1':''),{cache:'no-store'});
    if(!response.ok)throw Error('Tracker endpoint returned '+response.status);
    const d=await response.json();
    app.data=d;
    setConnection(d.mode);
    renderStats(d);renderMatches(d);renderGoals(d);checkNewGoals(d);
    if(force)toast(d.mode==='connected'?'Goal data checked.':d.statusMessage||'Showing stored data.');
  }catch(err){
    setConnection('error');
    $('lastUpdated').textContent='Could not reach the site server';
    if(force)toast('Unable to refresh: '+err.message);
    console.error(err);
  }finally{
    app.refreshing=false;$('refreshBtn').disabled=false;
  }
}
async function toggleNotifications(){
  if(app.notifications){app.notifications=false;toast('Goal alerts disabled for this browser.');}
  else{
    if(!('Notification'in window)){toast('This browser does not support desktop notifications.');return;}
    if(Notification.permission==='denied'){toast('Notifications are blocked. Enable them in your browser settings.');return;}
    const permission=await Notification.requestPermission();
    if(permission!=='granted'){toast('Notifications were not allowed.');return;}
    app.notifications=true;toast('Goal notifications enabled while this page stays open.');
  }
  $('notificationsBtn').classList.toggle('enabled',app.notifications);
  $('notificationsBtn').setAttribute('aria-label',app.notifications?'Turn off goal notifications':'Turn on goal notifications');
  $('notifyCta').firstChild.textContent=app.notifications?'GOAL ALERTS ENABLED ':'ENABLE GOAL ALERTS ';
  try{localStorage.setItem(STORE_ALERTS,app.notifications?'1':'0');}catch{}
}
for (const button of document.querySelectorAll('.filter-pill')){
  button.addEventListener('click',()=>{
    app.filter=button.dataset.filter;
    document.querySelectorAll('.filter-pill').forEach(b=>{
      const on=b===button;b.classList.toggle('selected',on);b.setAttribute('aria-pressed',String(on));
    });
    if(app.data)renderGoals(app.data);
  });
}
$('notificationsBtn').addEventListener('click',toggleNotifications);
$('notifyCta').addEventListener('click',toggleNotifications);
$('refreshBtn').addEventListener('click',()=>update(true));
$('copyrightYear').textContent=new Date().getFullYear();
try{app.notifications=localStorage.getItem(STORE_ALERTS)==='1'&&'Notification'in window&&Notification.permission==='granted';}catch{}
$('notificationsBtn').classList.toggle('enabled',app.notifications);
update();
setInterval(()=>{if(!document.hidden)update();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)update();});
