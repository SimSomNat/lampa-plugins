'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {harness, stream, Node} = require('./harness.cjs');
const click = (h, index = 0) => { h.rows[index].trigger('hover:enter'); return h.requests.at(-1); };
const unlocked = h => { for (const row of h.rows) assert.equal(!!row.element.loading, false); };

// Baseline mechanism: LAMPA clear() invalidates callbacks without terminating HTTP.
test('shared Reguest reproduces a permanently locked element without an independent timer', () => {
    const h = harness(), net = new h.Lampa.Reguest(), element = {loading: true};
    net.native('/a', () => { element.loading = false; }, () => { element.loading = false; });
    const a = h.requests.at(-1); net.clear();
    net.native('/b', () => {}, () => {}); a.success(stream()); h.clock.tick(60000);
    assert.equal(element.loading, true);
});
test('double press while pending resolves once; quality, subtitles, history and progress survive', () => {
    const h = harness(); h.load(); const a = click(h), count = h.requests.length; click(h);
    assert.equal(h.requests.length, count); a.success(stream()); a.lateSuccess(stream('late'));
    assert.equal(h.launches.length,1); unlocked(h); assert.equal(h.pending(),0);
    assert.equal(h.launches[0].url,'http://cdn.example/a.mp4');
    assert.equal(h.launches[0].subtitles[0].url,'http://cdn.example/sub.srt');
    assert.equal(h.launches[0].timeline.time,15); assert.equal(h.histories.length,1);
    assert.equal(h.values.online_view.length,1);
});
test('A then B: B wins; late A cannot cache a URL, launch, or unlock a newer A', () => {
    const h = harness(); h.load(); const a = click(h), b = click(h,1);
    assert.equal(h.rows[0].element.loading,false); b.success(stream('b')); a.lateSuccess(stream('a'));
    assert.equal(h.launches.length,1); assert.match(h.launches[0].url,/b.mp4$/);
    assert.equal(h.rows[0].element.stream,undefined); unlocked(h);
    const retry = click(h); a.lateError({status:500}); assert.equal(h.rows[0].element.loading,true);
    retry.success(stream('retry')); assert.equal(h.launches.length,2); unlocked(h);
});
test('lost native callback times out at 12 seconds; a late success is ignored and retry works', () => {
    const h = harness(); h.load(); const a = click(h); a.owner.clear();
    h.clock.tick(11999); assert.equal(h.rows[0].element.loading,true);
    h.clock.tick(1); unlocked(h); assert.match(h.notices.at(-1),/время ожидания/);
    const retry = click(h); a.lateSuccess(stream('stale')); assert.equal(h.rows[0].element.loading,true);
    retry.success(stream('retry')); assert.equal(h.launches.length,1); assert.equal(h.pending(),0);
});
test('independent context-menu resolution cannot clear or unlock a pending playback', () => {
    const h = harness(); h.load(); const a = click(h); let file;
    h.menus[1].file(value => { file = value; }); const b = h.requests.at(-1);
    assert.notEqual(a.owner,b.owner); b.success(stream('copy'));
    assert.equal(file.file,'http://cdn.example/copy.mp4'); assert.equal(h.rows[0].element.loading,true);
    a.success(stream()); assert.equal(h.launches.length,1); unlocked(h);
});
for (const status of [403,404,429,500]) test(`HTTP ${status} unlocks, reports status without body secrets, and allows retry`, () => {
    const h = harness(); h.load(); const a = click(h);
    a.error({status,responseText:'PRIVATE_COOKIE',message:'https://secret.example/token'});
    unlocked(h); assert.match(h.notices.at(-1),new RegExp('HTTP '+status));
    assert.doesNotMatch(h.notices.at(-1),/PRIVATE_COOKIE|secret/);
    click(h).success(stream()); assert.equal(h.launches.length,1);
});
for (const [label,response] of Object.entries({empty:'', malformed:'{bad JSON', null:null, noUrl:{}, invalid:{url:'[1080p]javascript:alert(1)'}, badBase64:{url:'#2%%%bad'}, badType:{url:42}})) {
    test(`${label} response fails without a lingering lock and next attempt succeeds`, () => {
        const h = harness(); h.load(); click(h).success(response); unlocked(h);
        assert.equal(h.launches.length,0); assert.equal(h.notices.length,1);
        click(h).success(stream()); assert.equal(h.launches.length,1);
    });
}
test('synchronous native exception unlocks and retry works', () => {
    const h = harness(); h.load(); h.throwSend(true); click(h); unlocked(h);
    assert.doesNotMatch(h.notices.at(-1),/SECRET/); h.throwSend(false); click(h).success(stream()); assert.equal(h.launches.length,1);
});
test('parser exception does not cache half a result or retain the lock', () => {
    const h = harness(); const {comp} = h.load(); const parse = comp.parsePlaylist;
    comp.parsePlaylist = () => { throw new Error('SECRET'); }; click(h).success(stream()); unlocked(h);
    assert.equal(h.rows[0].element.stream,undefined); comp.parsePlaylist = parse;
    click(h).success(stream()); assert.equal(h.launches.length,1);
});
test('destroy releases locks/timers; even raw callbacks do not touch UI or launch', () => {
    const h = harness(); const {comp} = h.load(); const a = click(h); const row = h.rows[0];
    comp.destroy(); assert.equal(row.element.loading,false); assert.equal(h.pending(),0);
    comp.reset = comp.empty = comp.append = () => { throw new Error('destroyed UI touched'); };
    a.lateSuccess(stream()); a.lateError({status:500}); h.clock.tick(60000);
    assert.equal(h.launches.length,0); assert.equal(h.notices.length,0); assert.equal(h.clock.jobs.size,0);
});
test('pause before stream reply cancels playback and late reply cannot launch', () => {
    const h = harness(); const {comp} = h.load(); const a = click(h); comp.pause(); a.lateSuccess(stream());
    unlocked(h); assert.equal(h.launches.length,0); assert.equal(h.pending(),0);
});
test('destroy while metadata is pending cannot start a source search', () => {
    const h = harness(); const {comp} = h.screen(false,{id:1,title:'Movie',source:'tmdb'});
    const meta = h.requests.at(-1), count = h.requests.length; comp.destroy();
    meta.lateSuccess({imdb_id:'tt1'}); meta.lateError({status:500}); h.clock.tick(60000);
    assert.equal(h.requests.length,count); assert.equal(h.pending(),0);
});
test('lost metadata callback falls back to source search after watchdog', () => {
    const h = harness(); h.screen(false,{id:1,title:'Movie',source:'tmdb'});
    h.clock.tick(12000); assert.match(h.requests.at(-1).url,/search.php/);
});
test('new search invalidates an old page and cancels a pending stream', () => {
    const h = harness(); const {comp,movie} = h.load(); const a = click(h);
    comp.testSource.search({movie:{...movie,title:'Next'}}); const search = h.requests.at(-1);
    a.lateSuccess(stream()); assert.equal(h.launches.length,0); unlocked(h);
    search.success(''); h.requests.at(-1).success(''); assert.equal(h.pending(),0);
});
test('page generation ignores an old page after a newer selection', () => {
    const h = harness(); const {comp} = h.load(true);
    comp.testSource.reset(); // cached original episodes, then a new page invalidates old data
    comp.testSource.wait_similars = true;
    comp.testSource.search({movie:{title:'Other',original_title:'Other'}},null,[{is_similars:true,link:'/new.html'}]);
    const page = h.requests.at(-1);
    comp.testSource.search({movie:{title:'Newest',original_title:'Newest'}},null,[{is_similars:true,link:'/newest.html'}]);
    page.lateSuccess('.initCDNSeriesEvents(9,1,1,1,');
    assert.equal(h.requests.at(-1).url.endsWith('/newest.html'),true);
});
for (const mode of ['success','error','timeout','destroy','player_close']) test(`lazy playlist ${mode} completes exactly once and never launches a failed item`, () => {
    const h = harness(); const {comp} = h.load(true); click(h).success(stream('first'));
    assert.equal(h.playlist.length,3); const cell = h.playlist[1]; let completions = 0;
    cell.url(() => { completions++; h.Lampa.Player.play(cell); }); const req = h.requests.at(-1);
    if (mode === 'success') req.success(stream('second'));
    if (mode === 'error') req.error({status:429});
    if (mode === 'timeout') h.clock.tick(12000);
    if (mode === 'destroy') comp.destroy();
    if (mode === 'player_close') h.Lampa.Player.listener.send('destroy',{});
    req.lateSuccess(stream('late')); req.lateError({status:500}); h.clock.tick(12000);
    assert.equal(completions,1); assert.equal(h.pending(),0);
    assert.equal(h.launches.length,mode === 'success' ? 2 : 1);
    assert.equal(h.Lampa.Player.listener.count('create'),0);
    if (mode !== 'success') assert.equal(typeof cell.url,'function');
});
test('switching a series voice cancels lazy resolution and allows a fresh play', () => {
    const h = harness(); const {comp} = h.load(true); click(h).success(stream());
    const cell = h.playlist[1]; let calls = 0;
    cell.url(() => { calls++; h.Lampa.Player.play(cell); }); const old = h.requests.at(-1);
    comp.testSource.filter('filter',{stype:'voice'},{index:0});
    assert.equal(calls,1); old.lateSuccess(stream('old')); assert.equal(h.launches.length,1);
    click(h).success(stream('new')); assert.equal(h.launches.length,2);
});
test('lazy invocation after screen destruction still calls once and aborts playback', () => {
    const h = harness(); const {comp} = h.load(true); click(h).success(stream());
    const cell = h.playlist[1]; comp.destroy(); let calls = 0;
    cell.url(() => { calls++; h.Lampa.Player.play(cell); }); assert.equal(calls,1); assert.equal(h.launches.length,1);
});
test('twenty open / play / destroy cycles do not accumulate pending work or source listeners', () => {
    const h = harness();
    for (let i=0;i<20;i++) {
        const {comp} = h.load(); click(h).success(stream(String(i))); h.Lampa.Player.listener.send('destroy',{}); comp.destroy();
        assert.equal(h.pending(),0); assert.equal(h.clock.jobs.size,0); assert.equal(h.Lampa.Player.listener.count('destroy'),0);
    }
    assert.equal(h.launches.length,20); assert.equal(h.window.hdrezkaRuntime.scopes.length,2);
});
test('double script load is idempotent before and after appready; next version replaces listeners', () => {
    const h = harness({appready:false}); const paramsUpdate = h.Lampa.Params.update;
    h.evaluate(); assert.equal(h.Lampa.Listener.count('full'),1); assert.equal(h.Lampa.Listener.count('app'),1);
    assert.equal(h.Lampa.Settings.listener.count('open'),1); assert.equal(h.Lampa.Params.update,paramsUpdate);
    h.Lampa.Listener.send('app',{type:'ready'}); h.window.appready = true; h.evaluate();
    assert.equal(h.Lampa.Listener.count('full'),1);
    h.evaluate(h.source.replace('21.10.2026-rezka-v2.2','22.10.2026-test'));
    assert.equal(h.window.hdrezkaRuntime.version,'22.10.2026-test'); assert.equal(h.Lampa.Listener.count('full'),1);
    assert.equal(h.Lampa.Settings.listener.count('open'),1);
});
test('missing IP callback blocks double push only until watchdog; stale callback cannot unlock new attempt', () => {
    const h = harness({storage:{online_mod_proxy_find_ip:true}}), movie = {title:'Movie'};
    h.window.testApi.loadOnline(movie); const old = h.requests.at(-1); h.window.testApi.loadOnline(movie);
    assert.equal(h.requests.length,1); h.clock.tick(12000); assert.equal(h.pushes.length,0);
    assert.match(h.notices.at(-1),/время ожидания/); h.window.testApi.loadOnline(movie); const current = h.requests.at(-1);
    old.lateSuccess({ip:'192.0.2.1'}); h.window.testApi.loadOnline(movie); assert.equal(h.requests.at(-1),current);
    current.success({ip:'192.0.2.2'}); assert.equal(h.pushes.length,1); assert.equal(h.pending(),0);
    current.lateSuccess({ip:'192.0.2.3'}); h.window.testApi.loadOnline(movie); assert.equal(h.pushes.length,1);
});
test('IP lookup stays disabled by default and navigation away prevents a late push', () => {
    const h = harness(); h.window.testApi.loadOnline({title:'Movie'}); assert.equal(h.requests.length,0); assert.equal(h.pushes.length,1);
    const ip = harness({storage:{online_mod_proxy_find_ip:true}}); ip.window.testApi.loadOnline({title:'Movie'});
    ip.setActive({component:'other'}); ip.requests[0].success({ip:'192.0.2.1'}); assert.equal(ip.pushes.length,0);
});
test('full completion does not reset an in-flight opening or insert duplicate buttons', () => {
    const h = harness({storage:{online_mod_proxy_find_ip:true}}), movie = {title:'Movie'}, body = new Node();
    const event = {type:'complite',data:{movie},object:{activity:{render:() => body}}};
    h.window.testApi.loadOnline(movie); h.Lampa.Listener.send('full',event); h.Lampa.Listener.send('full',event);
    h.window.testApi.loadOnline(movie); assert.equal(h.requests.length,1); assert.equal(body.anchor.children.length,1);
    h.requests[0].success({ip:'192.0.2.1'}); assert.equal(h.pushes.length,1);
});
test('saved settings persist; local input registration replaces the global monkey patch', () => {
    const saved = {online_mod_rezka2_cookie:'SECRET_COOKIE',online_mod_rezka2_password:'SECRET_PASSWORD',online_mod_rezka2_mirror:'https://mirror.example',online_mod_proxy_other_url:'https://proxy.example/',online_mod_proxy_rezka2:true};
    const h = harness({storage:saved}); for (const [key,value] of Object.entries(saved)) assert.equal(h.values[key],value);
    for (const name of ['online_mod_rezka2_cookie','online_mod_rezka2_password','online_mod_rezka2_mirror','online_mod_rezka2_name','online_mod_proxy_other_url']) assert.equal(h.paramValues[name],'');
    assert.match(h.templates.settings_online_mod,/data-name="online_mod_debug"/);
});
test('proxy, cookies, HLS preference and encrypted stream decoding remain functional', () => {
    const h = harness({storage:{online_mod_proxy_rezka2:true,online_mod_proxy_other:true,online_mod_proxy_other_url:'https://proxy.example/',online_mod_rezka2_cookie:'session=SECRET',online_mod_prefer_http:false,online_mod_prefer_mp4:false}});
    h.load(); const req = click(h); assert.match(req.url,/^https:\/\/proxy.example\/enc2\//);
    assert.match(req.params.headers.Cookie,/session=SECRET/); assert.match(req.data,/action=get_movie/);
    const value = stream(); value.url = '#2'+btoa(value.url); req.success(value);
    assert.equal(h.launches[0].url,'https://cdn.example/a.m3u8?');
});
test('diagnostics default off; enabled output includes terminal state and no sensitive data', () => {
    const quiet = harness(); quiet.load(); click(quiet).success(stream()); assert.equal(quiet.logs.length,0);
    const h = harness({storage:{online_mod_debug:true,online_mod_rezka2_cookie:'SECRET_COOKIE'}});
    h.load(); click(h).success(stream('SECRET_TOKEN')); const logs = JSON.stringify(h.logs);
    assert.doesNotMatch(logs,/SECRET|https?:|Cookie/); assert.match(logs,/player_launch/); assert.match(logs,/requestId/);
    assert.match(logs,/generation/); assert.match(logs,/pending/);
});
test('watchdog configuration is bounded and timers are removed after completion', () => {
    const h = harness({storage:{online_mod_request_timeout:15000}}); h.load(); click(h); h.clock.tick(14999);
    assert.equal(h.rows[0].element.loading,true); h.clock.tick(1); unlocked(h); assert.equal(h.clock.jobs.size,0);
    const fallback = harness({storage:{online_mod_request_timeout:'bad'}}); fallback.load(); click(fallback); fallback.clock.tick(12000); unlocked(fallback);
});
test('late episodes response cannot replace the new generation and its voice cache', () => {
    const h = harness(); const {comp,movie} = h.screen(true);
    comp.testSource.wait_similars = true;
    comp.testSource.search({movie},null,[{is_similars:true,link:'/series.html'}]);
    h.requests.at(-1).success('.initCDNSeriesEvents(7,1,1,1,'); const old = h.requests.at(-1);
    comp.testSource.reset(); const current = h.requests.at(-1); assert.notEqual(current,old);
    const response = name => ({seasons:'<li class="b-simple_season__item" data-tab_id="1">Сезон 1</li>',episodes:`<li class="b-simple_episode__item" data-season_id="1" data-episode_id="2">${name}</li>`});
    current.success(response('NEW')); old.lateSuccess(response('OLD'));
    assert.equal(h.rows.length,1); assert.match(h.rows[0].element.title,/NEW/); assert.equal(h.pending(),0);
});
test('twenty abandoned stream attempts followed by a successful launch release every lock', () => {
    const h = harness(); const late = [];
    for (let i=0;i<20;i++) { const {comp} = h.load(); late.push(click(h)); comp.destroy(); unlocked(h); }
    h.load(); click(h).success(stream('last'));
    for (const req of late) req.lateSuccess(stream('abandoned'));
    assert.equal(h.launches.length,1); assert.equal(h.pending(),0);
});
test('auth flows are independent, time bounded and do not block IP opening', () => {
    const h = harness({storage:{online_mod_proxy_find_ip:true}}); let success = 0, failure = 0;
    h.window.testApi.login(() => success++,() => failure++); const login = h.requests.at(-1);
    h.window.testApi.loadOnline({title:'Movie'}); const ip = h.requests.at(-1);
    assert.notEqual(login.owner,ip.owner); ip.success({ip:'192.0.2.1'}); assert.equal(h.pushes.length,1);
    h.clock.tick(12000); assert.equal(failure,1); login.lateSuccess({success:true}); assert.equal(success,0);
    h.window.testApi.login(() => success++,() => failure++); h.requests.at(-1).success({success:true});
    h.requests.at(-1).success('<html>ok</html>'); assert.equal(success,1); assert.equal(h.pending(),0);
    h.window.testApi.logout(() => success++,() => failure++); h.requests.at(-1).success('ok');
    assert.equal(success,2); assert.equal(h.values.online_mod_rezka2_status,'false');
});
test('cookie auto-fill retains credentials and completes exactly once', () => {
    const h = harness(); let success = 0, failure = 0;
    h.window.testApi.cookie(() => success++,() => failure++);
    const login = h.requests.at(-1);
    login.success({body:{success:true},headers:{'set-cookie':['PHPSESSID=session; Path=/','dle_user_id=123; Path=/']}});
    h.requests.at(-1).success({body:'<html>ok</html>',headers:{'set-cookie':['dle_password=secret; Path=/']}});
    login.lateError({status:500}); assert.equal(success,1); assert.equal(failure,0);
    assert.equal(h.values.online_mod_rezka2_cookie,'dle_user_id=123; dle_password=secret'); assert.equal(h.pending(),0);
});
test('failed lazy URL stays retryable instead of becoming a permanently empty playlist entry', () => {
    const h = harness(); h.load(true); click(h).success(stream()); const cell = h.playlist[1]; let calls = 0;
    const done = () => { calls++; h.Lampa.Player.play(cell); };
    cell.url(done); h.requests.at(-1).error({status:500});
    assert.equal(calls,1); assert.equal(h.launches.length,1); assert.equal(typeof cell.url,'function');
    cell.url(done); h.requests.at(-1).success(stream('retry'));
    assert.equal(calls,2); assert.equal(h.launches.length,2); assert.match(cell.url,/retry.mp4$/);
});
