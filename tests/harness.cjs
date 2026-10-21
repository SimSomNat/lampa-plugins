'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../hdrezka.js'), 'utf8');

class Events {
    constructor() { this.events = {}; }
    follow(type, fn) { (this.events[type] ||= []).push(fn); }
    remove(type, fn) { this.events[type] = (this.events[type] || []).filter(x => x !== fn); }
    send(type, data) { for (const fn of [...(this.events[type] || [])]) fn(data); }
    count(type) { return (this.events[type] || []).length; }
}
class Clock {
    constructor() { this.now = 0; this.next = 0; this.jobs = new Map(); }
    set(fn, delay) { const id = ++this.next; this.jobs.set(id, {at: this.now + delay, fn}); return id; }
    clear(id) { this.jobs.delete(id); }
    tick(ms) {
        const end = this.now + ms;
        for (;;) {
            const next = [...this.jobs].filter(([, job]) => job.at <= end).sort((a,b) => a[1].at-b[1].at)[0];
            if (!next) break;
            this.now = next[1].at; this.jobs.delete(next[0]); next[1].fn();
        }
        this.now = end;
    }
}
// Minimal DOM adapter for HDRezka's translator / episode fixtures and LAMPA event wiring.
class Node {
    constructor(html = '', count = 1) { this.html = html; this.length = count; this.events = {}; this.children = []; this[0] = this; }
    on(type, fn) { this.events[type] = fn; return this; }
    unbind(type) { delete this.events[type]; return this; }
    trigger(type, data) { return this.events[type]?.(data); }
    append(child) { this.children.push(child); return this; }
    after(child) { this.children.push(child); return this; }
    find(selector) { return select(selector, this); }
    each(fn) { if (this.length) fn.call(this); return this; }
    text(value) { if (value !== undefined) { this.value = value; return this; } return this.html.replace(/<[^>]*>/g, ''); }
    attr(name) { return this.html.match(new RegExp(name + '="([^"]*)"'))?.[1]; }
    data(name) { return this.attr('data-' + name); }
    hasClass() { return false; }
    eq() { return this; }
    parent() { return this; }
    last() { return this; }
    remove() { return this; }
    addClass() { return this; }
    removeClass() { return this; }
}
function select(selector, context) {
    if (selector instanceof Node) return selector;
    if (typeof selector !== 'string') return new Node();
    if (selector.startsWith('<')) return new Node(selector);
    if (selector.startsWith('.b-')) {
        const nodes = [...(context?.html || '').matchAll(/<li\b[^>]*>.*?<\/li>/g)]
            .filter(m => m[0].includes(selector.slice(1))).map(m => new Node(m[0]));
        const list = new Node('', nodes.length);
        list.each = fn => { nodes.forEach(node => fn.call(node)); return list; };
        return list;
    }
    if (selector === '.view--torrent') {
        context.anchor ||= new Node(); return context.anchor;
    }
    if (selector === '.view--online_mod') return new Node('', context?.anchor?.children.length || 0);
    if (selector === 'img' || selector === 'div.modal') return new Node('', 0);
    return new Node();
}
function harness(options = {}) {
    const clock = new Clock(), requests = [], notices = [], launches = [], pushes = [], logs = [], rows = [], menus = [], histories = [];
    const values = {...options.storage}, defaults = {}, paramValues = {}, templates = {};
    const listener = new Events(), playerEvents = new Events(), settingsEvents = new Events();
    let active = {component: 'full'}, playlist = [], metadataThrow = false;
    function Reguest() { this.calls = []; this.timeout = value => { this.timeoutMs = value; }; }
    Reguest.prototype.clear = function () { this.calls = []; };
    Reguest.prototype.errorDecode = (a,c) => c || `HTTP ${a.status}`;
    for (const method of ['native', 'silent']) Reguest.prototype[method] = function (url, ok, fail, data, params) {
        if (options.throwSend || metadataThrow) throw new Error('transport exception with SECRET');
        const req = {owner: this, method, url, data, params, ok, fail};
        req.success = value => { if (this.calls.includes(req)) ok(value); };
        req.error = value => { if (this.calls.includes(req)) fail(value || {status: 500}); };
        // Raw callbacks exercise generation checks even when a transport ignores clear().
        req.lateSuccess = ok; req.lateError = fail;
        this.calls.push(req); requests.push(req);
    };
    const Lampa = {
        Reguest, Platform: {tv() {}, is: name => name === 'android', version: 1},
        Storage: {
            get: (key, fallback) => Object.hasOwn(values,key) ? values[key] : fallback,
            set: (key,value) => { values[key] = value; },
            field: key => Object.hasOwn(values,key) ? values[key] : defaults[key],
            cache: (key,max,fallback) => values[key] ||= fallback
        },
        Params: {
            trigger: (key,value) => { defaults[key] = value; },
            select: (key,value,fallback) => { paramValues[key] = value; defaults[key] = fallback; },
            update() {}
        },
        Lang: {add() {}, translate: key => key},
        Listener: listener, Settings: {listener: settingsEvents, main: () => null},
        Manifest: {}, Component: {add(name, ctor) { this[name] = ctor; }},
        Activity: {active: () => active, push: object => { pushes.push(object); active = object; }, backward() {}},
        Template: {add: (key,value) => { templates[key] = value; }, get: (key,element) => { const node = new Node(); node.element = element; return node; }},
        Utils: {hash: value => value, cardImgBackground() {}},
        Timeline: {view: hash => ({hash, time: 15}), render: view => view},
        Favorite: {add: (...args) => histories.push(args)},
        Noty: {show: text => notices.push(text)},
        Arrays: {extend: (a,b) => Object.assign(a,b), decodeJson: (s,d) => { try { return JSON.parse(s); } catch { return d; } }},
        Scroll: function () { this.body = this.render = () => new Node(); this.minus = this.clear = this.reset = this.destroy = () => {}; },
        Explorer: function () { this.render = () => new Node(); this.destroy = () => {}; },
        Filter: function () { this.render = () => new Node(); this.set = this.chosen = () => {}; },
        Controller: {add() {}, toggle() {}}, Background: {immediately() {}},
        Player: {
            listener: playerEvents,
            play: item => { let aborted = false; playerEvents.send('create', {data: item, abort: () => { aborted = true; }}); if (!aborted) launches.push(item); },
            playlist: value => { playlist = value; }
        }
    };
    const window = {appready: options.appready !== false, location: {protocol: 'http:'}};
    const context = vm.createContext({Lampa, window, console: {log: (...args) => logs.push(args)}, $: select,
        setTimeout: (fn,ms) => clock.set(fn,ms), clearTimeout: id => clock.clear(id),
        Date: class extends Date { static now() { return clock.now; } },
        atob: str => atob(str), btoa: str => btoa(str)});
    function evaluate(code = source) {
        vm.runInContext(code.replace('    startPlugin();', '    window.testApi = {RequestScope: RequestScope, component: component, loadOnline: loadOnline, Utils: Utils, login: rezka2Login, logout: rezka2Logout, cookie: rezka2FillCookie};\n    startPlugin();'), context);
    }
    evaluate();
    function screen(series = false, customMovie) {
        rows.length = 0; menus.length = 0;
        const movie = customMovie || {id: 7, title: 'Movie', original_title: 'Movie'};
        const comp = new window.testApi.component({movie});
        comp.activity = {loader() {}, toggle() {}};
        active = {component: 'online_mod', movie, activity: comp.activity};
        comp.reset = () => { rows.length = 0; menus.length = 0; };
        comp.append = row => rows.push(row);
        comp.contextmenu = menu => menus.push(menu);
        comp.empty = message => notices.push(message);
        comp.find();
        // No search results: select a similar page via the actual source's public search method.
        return {comp, movie};
    }
    // Expose source ONLY inside this VM harness, not in the production plugin API.
    const exported = source.replace('var rezkaSource = new rezka2(this, object);', 'var rezkaSource = new rezka2(this, object); this.testSource = rezkaSource;');
    // Re-evaluate in a fresh runtime to install the instrumented constructor, retaining normal registrations.
    window.hdrezkaRuntime.dispose(); delete window.hdrezkaRuntime; evaluate(exported);
    function load(series = false) {
        const result = screen(series);
        result.comp.testSource.wait_similars = true;
        result.comp.testSource.search({movie: result.movie}, null, [{is_similars: true, link: '/film.html'}]);
        const page = requests.at(-1);
        page.success(series ? '.initCDNSeriesEvents(7,1,1,1,' : '.initCDNMoviesEvents(7,1,0,0,0,<ul id="translators-list"><li class="b-translator__item" data-translator_id="1">A</li><li class="b-translator__item" data-translator_id="2">B</li></ul>');
        if (series) requests.at(-1).success({seasons: '<li class="b-simple_season__item" data-tab_id="1">Сезон 1</li>',
            episodes: [1,2,3].map(n => `<li class="b-simple_episode__item" data-season_id="1" data-episode_id="${n}">Серия ${n}</li>`).join('')});
        clock.tick(10);
        return result;
    }
    return {clock, requests, notices, launches, pushes, logs, rows, menus, histories, values, defaults, templates, paramValues, Lampa, window, context,
        screen, load, evaluate, source, get playlist() { return playlist; }, setActive: value => { active = value; }, throwSend: value => { metadataThrow = value; },
        pending: () => window.hdrezkaRuntime.scopes.reduce((sum,scope) => sum + scope.pending.length,0)};
}
const stream = (suffix = 'a') => ({url: `[1080p]https://cdn.example/${suffix}.mp4 or https://cdn.example/${suffix}.m3u8,[720p]https://cdn.example/${suffix}-720.mp4`, subtitle: '[RU]https://cdn.example/sub.srt'});
module.exports = {harness, stream, Events, Node};
