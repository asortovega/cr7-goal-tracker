'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {server,acceptedGoals,normalizedName,selectTeam,SNAPSHOT}=require('../server');

function sampleFixture(events){
  return {
    fixture:{id:1234,date:'2026-11-02T18:00:00Z',status:{short:'FT'}},
    teams:{home:{id:300,name:'Al Nassr'},away:{id:301,name:'FC Example'}},
    goals:{home:3,away:1},
    league:{name:'Pro League'},events
  };
}

test('baseline is dated and excludes pre-cutoff goals',()=>{
  assert.equal(SNAPSHOT.goals,985);
  assert.equal(SNAPSHOT.start,'2026-10-31');
});

test('normalize team names',()=>{
  assert.equal(normalizedName('Al-Nassr'),'alnassr');
  assert.equal(selectTeam([{team:{id:22,name:'Al-Nassr'}}],'club').team.id,22);
});

test('goal event picks Ronaldo and excludes missed penalty, own goal and other scorers',()=>{
  const goals=acceptedGoals(sampleFixture([
    {type:'Goal',detail:'Normal Goal',player:{id:874,name:'Cristiano Ronaldo'},time:{elapsed:12,extra:null}},
    {type:'Goal',detail:'Penalty',player:{id:874,name:'Cristiano Ronaldo'},time:{elapsed:45,extra:2}},
    {type:'Goal',detail:'Own Goal',player:{id:874,name:'Cristiano Ronaldo'},time:{elapsed:48}},
    {type:'Goal',detail:'Missed Penalty',player:{id:874,name:'Cristiano Ronaldo'},time:{elapsed:62}},
    {type:'Goal',detail:'Normal Goal',player:{id:999,name:'Somebody Else'},time:{elapsed:80}}
  ]),{club:{id:300,name:'Al Nassr'},national:{id:27,name:'Portugal'}});
  assert.equal(goals.length,2);
  assert.equal(goals[0].minute,'12');
  assert.equal(goals[1].minute,'45+2');
  assert.equal(goals[1].kind,'Penalty');
  assert.equal(goals[0].opponent,'FC Example');
});

test('canceled goal is excluded when VAR event identifies same player',()=>{
  const goals=acceptedGoals(sampleFixture([
    {type:'Goal',detail:'Normal Goal',player:{id:874,name:'Cristiano Ronaldo'},time:{elapsed:38}},
    {type:'Var',detail:'Goal cancelled',player:{id:874,name:'Cristiano Ronaldo'},time:{elapsed:39}}
  ]),{club:{id:300,name:'Al Nassr'},national:{id:27,name:'Portugal'}});
  assert.equal(goals.length,0);
});

test('server provides demo response and serves HTML without a key',async()=>{
  await new Promise(resolve=>server.listen(0,resolve));
  const address=server.address();
  try{
    let r=await fetch(`http://localhost:${address.port}/api/overview`);
    assert.equal(r.status,200);
    const data=await r.json();
    assert.equal(data.goals,985);
    assert.equal(data.mode,'demo');
    assert.ok(data.recentGoals.length>=3);
    r=await fetch(`http://localhost:${address.port}/`);
    assert.equal(r.status,200);
    assert.match(await r.text(),/THE ROAD/);
  }finally{await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve()));}
});
