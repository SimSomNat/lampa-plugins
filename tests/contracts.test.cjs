'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {NativeRequest,installPlaylist} = require('./fixtures/lampa-contracts.cjs');
const {harness,stream,Events} = require('./harness.cjs');
test('pinned upstream native/clear suppresses callbacks without aborting the native call', () => {
    const sent = []; let called = 0;
    const net = new NativeRequest(data => sent.push(data),{extend:Object.assign},{send() {}});
    net.native('/first',() => called++,() => called++); net.clear();
    sent[0].complite({}); sent[0].error({}); assert.equal(called,0);
    net.native('/second',() => called++,() => called++); sent[1].complite({}); assert.equal(called,1);
});
for (const result of ['success','error','timeout','destroy']) test(`pinned upstream playlist callback exits its wait on ${result}`, () => {
    const h = harness(); const {comp} = h.load(true);
    h.rows[0].trigger('hover:enter'); h.requests.at(-1).success(stream());
    const Playlist = {listener:new Events(),get:() => h.playlist,set() {}};
    const Video = {saveParams:() => ({}),video:() => ({}),verifyTube:() => false,pause() {},setParams() {}};
    let destroys = 0;
    const waiting = installPlaylist(Playlist,Video,{loading() {}},{pictureInPictureElement:null},() => {
        destroys++; h.Lampa.Player.listener.send('destroy',{});
    },h.Lampa.Player.play);
    Playlist.listener.send('select',{item:h.playlist[1]}); assert.equal(waiting(),true);
    const req = h.requests.at(-1);
    if (result === 'success') req.success(stream('next'));
    if (result === 'error') req.error({status:403});
    if (result === 'timeout') h.clock.tick(12000);
    if (result === 'destroy') comp.destroy();
    assert.equal(waiting(),false); assert.equal(destroys,1);
    assert.equal(h.launches.length,result === 'success' ? 2 : 1);
    req.lateSuccess(stream('late')); assert.equal(destroys,1);
});
