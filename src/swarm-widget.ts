import type { SwarmSnapshot, SwarmEvent, SwarmCoreController, SwarmController, SwarmGameOptions } from '../integration/swarm-types.js';

import { createDomDefender } from './dom-defender.js';

/*! @license Bug icon derived from Lucide, ISC License. See THIRD_PARTY_NOTICES.md. */
const bugIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3.003 3.003 0 1 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>`;
const icons = {
  target: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>',
  minimize: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5Z"/><circle cx="10" cy="10" r="2.3"/></svg>',
  close: '<svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15"/></svg>',
  pause: '<svg viewBox="0 0 20 20"><path d="M7 5v10M13 5v10"/></svg>',
  play: '<svg viewBox="0 0 20 20"><path d="m7 4 9 6-9 6z"/></svg>',
  arrow: '<svg viewBox="0 0 20 20"><path d="M4 10h12m-5-5 5 5-5 5"/></svg>',
  sound: '<svg viewBox="0 0 20 20"><path d="M3 8h3l4-4v12l-4-4H3zM14 6q4 4 0 8"/></svg>',
  mute: '<svg viewBox="0 0 20 20"><path d="M3 8h3l4-4v12l-4-4H3zM14 8l4 4m0-4-4 4"/></svg>'
};

const styles = `
:host{all:initial!important;position:fixed!important;right:max(22px,env(safe-area-inset-right))!important;bottom:max(22px,env(safe-area-inset-bottom))!important;z-index:2147483100!important;display:block!important;font-family:Inter,Arial,Helvetica,sans-serif!important;color:#f7f9fb!important;color-scheme:dark!important;line-height:1.45!important;pointer-events:auto!important;direction:ltr!important;unicode-bidi:isolate!important;writing-mode:horizontal-tb!important;-webkit-font-smoothing:antialiased!important}
*{box-sizing:border-box}button{font:inherit;cursor:pointer;touch-action:manipulation}button:focus-visible,a:focus-visible{outline:2px solid #00e5ff;outline-offset:4px}button:disabled{opacity:.45;cursor:default}button svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}button:hover{filter:brightness(1.12)}[hidden]{display:none!important}
.panel{width:310px;border:1px solid #3c3e45;border-radius:14px;background:#16171bf5;box-shadow:0 12px 55px #0008,0 0 0 5px #0001;overflow:hidden;backdrop-filter:blur(16px)}
.top{display:flex;align-items:center;gap:8px;padding:15px 17px 12px;border-bottom:1px solid #ffffff0d}.brand{flex:1;font:10px/1.3 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:1.5px;color:#d6d8e0}.led{width:6px;height:6px;border-radius:50%;background:#00e5ff;box-shadow:0 0 9px #00e5ff55}.led.live{background:#ff343b;box-shadow:0 0 9px #ff343b55}.icon{width:30px;height:30px;border:0;display:grid;place-items:center;background:transparent;color:#9499a6;border-radius:6px;padding:6px}.icon:hover{background:#ffffff0b;color:#fff}.intro{padding:20px}.introhead{display:flex;gap:13px;align-items:center}.mascot{width:44px;height:44px;flex-shrink:0;border:1px solid #ff343b28;background:#ff343b09;border-radius:12px;display:grid;place-items:center;color:#ff343b}.mascot svg{width:27px;height:27px}.eyebrow{color:#9298a7;font:9px ui-monospace,monospace;letter-spacing:1.4px;margin:0 0 4px}.intro h2{font-weight:500;font-size:21px;letter-spacing:-.6px;margin:0}.intro p{font-size:12px;color:#a6aab5;line-height:1.7;margin:16px 0}.rules{display:flex;align-items:center;justify-content:space-between;padding:11px 0 16px;gap:8px;color:#8f95a3;font:10px ui-monospace,monospace}.rulebug{display:flex;gap:5px;align-items:center;white-space:nowrap}.rulebug svg{width:16px;height:16px;color:#ff343b}.rulebug:nth-child(2) svg{color:#ff168f}.rulebug:nth-child(3) svg{color:#b39aff}.primary{width:100%;display:flex;justify-content:center;align-items:center;gap:10px;border:1px solid #00e5ff;background:#00e5ff;color:#07141c;font-size:13px;font-weight:600;border-radius:7px;min-height:45px;padding:10px 15px}.secondary{width:100%;color:#b7bcc8;font-size:12px;background:transparent;border:1px solid #3c3e45;border-radius:7px;min-height:40px;margin-top:9px}.smallnote{font:10px ui-monospace,monospace;color:#737b89;text-align:center;margin-top:12px}.exitnote{display:flex;align-items:center;justify-content:center;gap:5px;margin-top:10px;color:#a6aab5;font:10px/1.5 ui-monospace,monospace}.exitnote kbd{padding:1px 5px;border:1px solid #ffffff30;border-radius:4px;background:#ffffff08;color:#edf1f8;font:inherit;box-shadow:0 1px 0 #ffffff12}.launcher{display:flex;align-items:center;justify-content:center;margin-left:auto;width:46px;height:46px;padding:0 12px;border:1px solid #45454b;background:#16171b;color:#f5f6f9;border-radius:24px;box-shadow:0 4px 24px #0005;font-size:12px;overflow:hidden;transition:width .2s ease}.launcher svg{width:20px;height:20px;flex:0 0 20px;color:#00e5ff}.launcher .label{max-width:0;opacity:0;overflow:hidden;white-space:nowrap;transition:max-width .2s ease,opacity .16s ease,margin .2s ease}.launcher:focus-visible{width:166px}.launcher:focus-visible .label{max-width:120px;opacity:1;margin-left:10px}@media(hover:hover){.launcher:hover{width:166px}.launcher:hover .label{max-width:120px;opacity:1;margin-left:10px}}.game{padding:15px 18px 16px}.scoreline{display:flex;align-items:center;justify-content:space-between;gap:12px}.scorelabel{font:9px ui-monospace,monospace;letter-spacing:1.5px;color:#8b93a3}.score{font:500 34px/1.2 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:-1.6px;margin-top:3px;color:#f4f7ff}.wave{border:1px solid #ffffff19;background:#ffffff04;border-radius:7px;padding:8px 10px;font:10px ui-monospace,monospace;color:#98a0ad;text-align:center}.wave strong{display:block;font-size:19px;color:#f4f7ff;font-weight:400;line-height:1.4}.stats{display:flex;align-items:center;justify-content:space-between;margin:14px 0 15px;color:#8f97a5;font:10px ui-monospace,monospace}.stats b{color:#e3e7ef;font-weight:500}.combo{color:#00e5ff!important}.integrityhead{display:flex;justify-content:space-between;align-items:center;font:9px ui-monospace,monospace;letter-spacing:1px;color:#8f97a5}.integrityhead strong{color:#65ff00;font-size:10px}.meter{height:4px;background:#303139;border-radius:4px;overflow:hidden;margin-top:8px}.meter span{display:block;height:100%;width:100%;background:#65ff00;transition:width .25s,color .3s}.targets{display:flex;gap:9px;margin-top:8px;font:9px ui-monospace,monospace;color:#76808e;flex-wrap:wrap}.targets span{display:flex;gap:5px;align-items:center}.targets i{width:4px;height:4px;border-radius:50%;background:#65ff00}.feed{border-top:1px solid #ffffff0d;color:#8e96a4;padding:11px 17px;font:10px/1.4 ui-monospace,monospace;min-height:37px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.feed.good{color:#65ff00}.feed.hot{color:#ffad80}.pauseview{padding:22px 20px}.pauseview h2,.result h2{font-size:22px;font-weight:500;letter-spacing:-.6px;margin:0 0 9px}.pauseview p,.result p{color:#999fae;font-size:12px;line-height:1.65;margin:0 0 20px}.result{padding:22px 20px}.result .total{font:44px/1.3 ui-monospace,monospace;letter-spacing:-2px;margin:6px 0 14px}.resultgrid{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #ffffff15;border-bottom:1px solid #ffffff15;padding:14px 0;margin-bottom:18px}.resultgrid span{font:9px ui-monospace,monospace;color:#8b93a3}.resultgrid b{display:block;font-size:16px;font-weight:400;color:#e8ecf5;margin-top:4px}.newbest{color:#00e5ff;font:9px ui-monospace,monospace;letter-spacing:1px}.statusbanner{position:fixed;left:50vw;top:110px;transform:translateX(-50%);background:#14171bee;border:1px solid #ffffff24;color:#f5f6fa;border-radius:100px;padding:12px 24px;pointer-events:none;font:12px ui-monospace,monospace;white-space:nowrap;box-shadow:0 6px 30px #0003}.statusbanner strong{color:#00e5ff}.livehint{color:#596472;font:9px ui-monospace,monospace;text-align:center;margin-top:8px}.mobiletip{display:none}
.pressure{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:-3px 0 12px;font:9px/1.4 ui-monospace,monospace;color:#8f97a5}.pressure.frenzy{color:#ffea00}.pressure .clock{color:#b5bdcc;white-space:nowrap}.targets .offscreen{opacity:.8}.targets .offscreen i{background:transparent!important;border:1px solid #929cad}#sound,#minimize{width:44px;min-width:44px;height:44px;padding:12px}#pause,#close,.led{flex-shrink:0}
:host([data-swarm-round]) .top{gap:4px;padding-left:11px;padding-right:11px}:host([data-swarm-round]) .brand{font-size:9px;letter-spacing:1px;white-space:nowrap;min-width:0}
:host([data-swarm-collapsed]){left:auto!important;width:max-content!important}
@media(max-width:640px){:host{right:12px!important;bottom:max(12px,env(safe-area-inset-bottom))!important;left:12px!important}.panel{width:min(100%,330px);margin-left:auto;border-radius:12px}.launcher{margin-left:auto}.panel.playing{width:100%}.playing .top{padding:6px 11px;border-bottom:0}.playing .game{padding:1px 12px 10px}.playing .scoreline{float:left;gap:10px;margin-right:15px;min-width:130px}.playing .scorelabel{font-size:8px}.playing .score{font-size:25px;letter-spacing:-1px}.playing .wave{border:0;padding:2px 6px;font-size:8px}.playing .wave strong{font-size:17px}.playing .stats{margin:1px 0 6px;padding-top:2px;font-size:9px}.playing .targets{display:none}.playing .pressure{clear:both;margin:0 0 7px;padding-top:3px;font-size:9px}.playing .integrityhead{font-size:8px}.playing .meter{margin-top:6px}.playing .feed{padding:7px 12px;font-size:9px;min-height:29px}.livehint{display:none}.statusbanner{top:88px;padding:10px 16px;font-size:11px}.mobiletip{display:inline}.desktoptip{display:none}.intro{padding:17px}.intro p{margin:13px 0}.rules{padding:8px 0 13px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

/** Mount once inside a dedicated host; destroy restores the page and releases all listeners. */
export function mountSwarmGame(host: HTMLElement, options: SwarmGameOptions = {}): SwarmController {
  if (!host || !host.isConnected) throw new Error('Swarm Protocol needs a connected host element.');
  host.setAttribute('data-swarm-ui', '');
  const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${styles}</style>
    <button class="launcher" id="launcher" aria-label="Open Swarm Protocol game" hidden>${icons.target}<span class="label">Swarm Protocol</span></button>
    <section class="panel" id="panel" aria-label="Swarm Protocol game">
      <header class="top"><span class="led" id="led"></span><span class="brand">SWARM PROTOCOL</span><button class="icon" id="sound" title="Mute sound" aria-label="Mute game sound" aria-pressed="true">${icons.sound}</button><button class="icon" id="pause" title="Pause game" aria-label="Pause game" hidden>${icons.pause}</button><button class="icon" id="minimize" title="Minimize scoreboard (game keeps running)" aria-label="Minimize scoreboard" hidden>${icons.minimize}</button><button class="icon" id="close" title="Close and restore page" aria-label="Close game and restore page">${icons.close}</button></header>
      <div class="intro" id="intro"><div class="introhead"><span class="mascot">${bugIcon}</span><div><div class="eyebrow">A LITTLE CONTAINMENT FAILURE</div><h2>The lab has a leak.</h2></div></div><p>They bite letters one at a time. At 6 letters they grow; at 12 they hunt buttons, biting letters in their path. Squash them first.</p><div class="rules"><span class="rulebug">${bugIcon}1 hit</span><span class="rulebug">${bugIcon}2 hits</span><span class="rulebug">${bugIcon}3 hits</span></div><button class="primary" id="start">Release the swarm ${icons.arrow}</button><div class="smallnote">Fast kills pay. Alerts let you spend points to jump or zap.</div><div class="exitnote">Press <kbd>Esc</kbd> to completely exit.</div></div>
      <div id="active" hidden><div class="game"><div class="scoreline"><div><div class="scorelabel">SCORE</div><div class="score" id="score">000000</div></div><div class="wave">WAVE<strong id="wave">01</strong></div></div><div class="stats"><span><b id="kills">0</b> squashed</span><span><b id="alive">0</b> active</span><b class="combo" id="combo">×1</b></div><div class="pressure" id="pressure"><span id="pursuit">Contain the swarm</span><span class="clock" id="waveclock">Next wave 18s</span></div><div class="integrityhead"><span>BUTTON INTEGRITY</span><strong id="integrity">100%</strong></div><div class="meter"><span id="bar"></span></div><div class="targets" id="targets"></div></div><div class="feed" id="feed">Kill them before they feed.</div></div>
      <div class="pauseview" id="paused" hidden><div class="eyebrow">TIMEOUT</div><h2>Swarm on standby.</h2><p>The bugs can wait. Your score and the page are exactly where you left them.</p><button class="primary" id="resume">Resume game ${icons.play}</button><button class="secondary" id="quit">Quit & restore page</button></div>
      <div class="result" id="result" hidden><div class="eyebrow">CONTAINMENT LOST</div><h2>The bugs won this round.</h2><div class="newbest" id="record">FINAL SCORE</div><div class="total" id="total">0</div><div class="resultgrid"><div><span>WAVE</span><b id="finalwave">1</b></div><div><span>SQUASHED</span><b id="finalkills">0</b></div><div><span>PERSONAL BEST</span><b id="best">0</b></div></div><button class="primary" id="restart">Reboot & play again ${icons.arrow}</button><button class="secondary" id="restore">Restore the page</button></div>
    </section><div class="livehint" id="hint" hidden><span class="desktoptip">CLICK TO SQUASH · ESC TO EXIT</span><span class="mobiletip">TAP TO SQUASH</span></div><div class="statusbanner" id="banner" hidden aria-live="polite"></div><div id="announce" role="status" aria-live="polite" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)"></div>`;
  const elements = new Map<string, HTMLButtonElement>();
  const $ = (id: string) => { if(!elements.has(id))elements.set(id,root.getElementById(id) as HTMLButtonElement);return elements.get(id)!; };
  const setText = (id: string,value: string | number) => { const el=$(id),text=String(value);if(el.textContent!==text)el.textContent=text; };
  const hostFlags = new Map();
  const flagHost = (name: string,value: boolean) => { if(hostFlags.get(name)===value)return;hostFlags.set(name,value);if(value)host.setAttribute(name,'');else host.removeAttribute(name); };
  const styleValues = new Map();
  const setStyle = (id: string,property: "color" | "width" | "background",value: string) => { const key=id+':'+property;if(styleValues.get(key)!==value){$(id).style[property]=value;styleValues.set(key,value);} };
  let destroyed = false, closed = options.initiallyClosed !== false, escaped = false, minimized = false, lastStatus = 'idle';
  const doc = host.ownerDocument || document, win = doc.defaultView || window;
  const soundKey = (options.bestKey || 'swarm-protocol-best-v1') + ':sound';
  let sound = true, audioContext: AudioContext | null = null, masterGain: GainNode | null = null, bannerTimer = 0, feedTimer = 0;
  let audioUnlocked = false, audioUnavailable = false, audioUnlocking: Promise<void> | null = null, pendingCue: {type:string;epoch:number} | null = null, audioEpoch = 0;
  let sessionStarted = false;
  type Voice = {source: OscillatorNode;gain: GainNode;done:boolean;finish():void};
  const voices = new Set<Voice>(), cueTimes = new Map<string,number>(), warnedTargets = new Map<string,Set<number>>();
  try { sound = win.localStorage.getItem(soundKey) !== 'off'; } catch (_) {}
  let lastBest = 0, previousTargetMarkup = '', latestState: SwarmSnapshot | null = null;
  let feedHoldUntil = 0, feedPriority = 0, lastBiteFeedAt = -Infinity;
  const disposers: (()=>void)[] = [];
  const on = (id: string, callback: (event: MouseEvent) => void) => { const el=$(id); el.addEventListener('click', callback); disposers.push(()=>el.removeEventListener('click',callback)); };
  const show = (id: string, value: boolean) => { const el=$(id);if(el.hidden===value)el.hidden=!value; };
  const announce = (text: string) => { $('announce').textContent=text; };
  function banner(text: string) { clearTimeout(bannerTimer); $('banner').textContent=text; show('banner',!closed&&!minimized); bannerTimer=setTimeout(()=>show('banner',false),2100); announce(text); }
  function feed(text: string, mood='', priority=1) {
    const now=win.performance?.now?.() ?? Date.now();
    if(now<feedHoldUntil && priority<feedPriority)return false;
    feedPriority=priority;feedHoldUntil=now+(priority>=2?1100:350);
    clearTimeout(feedTimer);$('feed').textContent=text;$('feed').className='feed '+mood;
    feedTimer=setTimeout(()=>{$('feed').textContent=latestState?.frenzy?'The swarm is still active offscreen.':'6 letters to grow. 12 to hunt.';$('feed').className='feed';feedPriority=0;feedHoldUntil=0;},2900);
    return true;
  }
  function soundButton() {
    const enabled = sound && !audioUnavailable, button = $('sound');
    button.innerHTML = enabled ? icons.sound : icons.mute;
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', audioUnavailable ? 'Game sound unavailable in this browser' : enabled ? 'Mute game sound' : 'Enable game sound');
    button.title = audioUnavailable ? 'Sound unavailable' : enabled ? 'Sound on · mute' : 'Sound off · enable';
    button.disabled = audioUnavailable;
  }
  function silence(lock = false) {
    audioEpoch++;
    pendingCue = null;
    if (lock) audioUnlocked = false;
    for (const voice of [...voices]) {
      try {
        voice.gain.gain.cancelScheduledValues(audioContext!.currentTime);
        voice.gain.gain.setValueAtTime(0, audioContext!.currentTime);
        voice.source.stop(audioContext!.currentTime);
      } catch (_) {}
      voice.finish();
    }
  }
  function userGesture(e?: Event) {
    return e?.isTrusted === true || win.navigator?.userActivation?.isActive === true;
  }
  function unlockAudio(e?: Event) {
    if (destroyed || !sound || audioUnavailable || doc.hidden || !userGesture(e)) return;
    try {
      if (!audioContext) {
        const Context = win.AudioContext || (win as Window & {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
        if (!Context) { audioUnavailable = true; soundButton(); return; }
        audioContext = new Context();
        masterGain = audioContext!.createGain();
        masterGain.gain.setValueAtTime(.14, audioContext!.currentTime);
        masterGain.connect(audioContext.destination);
      }
      audioUnlocked = true;
      // Only this gesture path creates/resumes audio; engine events never do.
      if (audioContext.state !== 'running' && audioContext.state !== 'closed' && !audioUnlocking) {
        audioUnlocking = Promise.resolve(audioContext.resume()).then(() => {
          audioUnlocking = null;
          const cue = pendingCue;
          pendingCue = null;
          if (!destroyed && sound && audioUnlocked && !doc.hidden && cue?.epoch === audioEpoch) tone(cue.type);
        }).catch(() => { audioUnlocking = null; pendingCue = null; });
      }
    } catch (_) { audioUnlocked = false; }
  }
  function note(frequency: number, endFrequency: number, duration: number, delay = 0, type: OscillatorType = 'triangle', volume = .11, crunchy = false) {
    if (voices.size >= 6) return;
    let source: OscillatorNode | undefined, gain: GainNode | undefined, voice: Voice | undefined;
    try {
      source = audioContext!.createOscillator();
      gain = audioContext!.createGain();
      const startAt = audioContext!.currentTime + delay, endAt = startAt + duration;
      source.type = type;
      source.frequency.setValueAtTime(frequency, startAt);
      if (crunchy) {
        source.frequency.setValueAtTime(frequency * .67, startAt + duration * .25);
        source.frequency.setValueAtTime(frequency * .36, startAt + duration * .52);
        source.frequency.setValueAtTime(endFrequency, startAt + duration * .78);
      } else source.frequency.exponentialRampToValueAtTime(endFrequency, endAt);
      gain.gain.setValueAtTime(.0001, startAt);
      gain.gain.linearRampToValueAtTime(volume, startAt + .004);
      gain.gain.exponentialRampToValueAtTime(.0001, endAt);
      source.connect(gain); gain.connect(masterGain!);
      voice = { source, gain, done: false, finish() {
        if (this.done) return;
        this.done = true;
        source!.onended = null;
        try { source!.disconnect(); } catch (_) {}
        try { gain!.disconnect(); } catch (_) {}
        voices.delete(this);
      } };
      source.onended = () => voice!.finish();
      voices.add(voice);
      source.start(startAt); source.stop(endAt + .012);
    } catch (_) {
      try { source?.stop(); } catch (_) {}
      voice?.finish();
      try { source?.disconnect(); gain?.disconnect(); } catch (_) {}
    }
  }
  function tone(type: string) {
    if (!sound || !audioUnlocked || !audioContext || destroyed || doc.hidden) return;
    if (audioContext.state !== 'running') {
      // Retain only the short start/preview cue while a gesture resume resolves.
      if (audioUnlocking && (type === 'wave-start' || type === 'preview')) pendingCue = { type, epoch: audioEpoch };
      return;
    }
    const now = audioContext!.currentTime;
    const bucket = type === 'kill' || type === 'hit' ? 'action' : type;
    const cooldown = bucket === 'action' ? .045 : type === 'bite' ? .15 : type === 'warning' ? 1.2 : .18;
    if (type !== 'gameover' && now - (cueTimes.get(bucket) ?? -Infinity) < cooldown) return;
    if (type === 'bite' && voices.size >= 4) return;
    cueTimes.set(bucket, now);
    if (type === 'gameover' || type === 'wave-clear') silence();
    if (type === 'hit' || type === 'preview') note(1050, 240, .065, 0, 'triangle', .12);
    if (type === 'bite') note(680, 390, .026, 0, 'triangle', .035);
    if (type === 'kill') {
      note(760, 105, .12, 0, 'square', .07, true);
      note(150, 55, .13, .015, 'triangle', .10);
    }
    if (type === 'wave-start') {
      note(330, 390, .09); note(490, 580, .10, .075); note(730, 840, .12, .15);
    }
    if (type === 'wave-clear') {
      note(523, 523, .13); note(659, 659, .13, .09); note(784, 900, .19, .18);
    }
    if (type === 'warning') {
      note(220, 195, .10, 0, 'triangle', .12); note(180, 155, .12, .15, 'triangle', .12);
    }
    if (type === 'breach') {
      note(280, 140, .16, 0, 'square', .055); note(145, 65, .21, .10, 'triangle', .12);
    }
    if (type === 'gameover') {
      note(370, 290, .16, 0, 'triangle', .12); note(250, 170, .18, .13, 'triangle', .12); note(150, 48, .30, .28, 'triangle', .13);
    }
  }
  function damageSound(e: Extract<SwarmEvent,{type:"damage"}>) {
    let thresholds = warnedTargets.get(e.targetId);
    if (!thresholds) { thresholds = new Set(); warnedTargets.set(e.targetId, thresholds); }
    if (e.health <= 0 && !thresholds.has(0)) {
      thresholds.add(0); thresholds.add(25); thresholds.add(50); tone('breach');
    } else {
      const crossed = [25, 50].filter(value => e.health <= value && !thresholds.has(value));
      crossed.forEach(value => thresholds.add(value));
      if (crossed.length) tone('warning');
    }
  }
  function render(s: SwarmSnapshot) {
    if(destroyed) return;
    latestState=s;
    const restoreResultFocus=minimized && s.status==='gameover' && root.activeElement===$('launcher');
    if(minimized && s.status==='gameover'){minimized=false;closed=false;}
    const playing=['running','intermission'].includes(s.status), canMinimize=playing||s.status==='paused';
    const launcherVisible=minimized || (closed && !escaped && options.showLauncher !== false), panelVisible=!closed&&!minimized;
    flagHost('data-swarm-collapsed',launcherVisible);flagHost('data-swarm-round',canMinimize);
    show('launcher',launcherVisible); show('panel',panelVisible); show('hint',panelVisible&&playing); show('intro',s.status==='idle'); show('active',playing); show('paused',s.status==='paused'); show('result',s.status==='gameover'); show('pause',playing);show('minimize',canMinimize);
    const minimizeTitle=s.status==='paused'?'Minimize scoreboard (stays paused)':'Minimize scoreboard (game keeps running)';
    if($('minimize').title!==minimizeTitle)$('minimize').title=minimizeTitle;
    $('panel').classList.toggle('playing',playing);$('led').classList.toggle('live',playing);
    setText('score',String(s.score||0).padStart(6,'0'));setText('wave',String(s.wave||1).padStart(2,'0'));setText('kills',s.kills||0);setText('alive',s.alive||0);setText('combo','×'+(s.combo||1));
    const offscreen=s.offscreenBugs||0;
    $('pressure').classList.toggle('frenzy',!!s.frenzy&&s.status==='running');
    setText('pursuit',s.status==='intermission'?'Swarm contained':s.frenzy?(offscreen?offscreen+' offscreen · hunting':'Frenzy · no button in view'):offscreen?offscreen+' bugs offscreen':'Contain the swarm');
    setText('waveclock','Next wave '+Math.max(0,Math.ceil(s.nextWaveIn||0))+'s');
    const health=Math.round(s.integrity ?? 100), color=health>55?'#65ff00':health>25?'#ffea00':'#ff343b';
    setText('integrity',health+'%');setStyle('integrity','color',color);setStyle('bar','width',health+'%');setStyle('bar','background',color);
    const targets=(s.targets||[]).slice(0,4).map(t=>({label:String(t.label||'Button').slice(0,18),health:Math.round(t.health),visible:t.visible!==false}));
    const key=JSON.stringify(targets);
    if(key!==previousTargetMarkup){ $('targets').replaceChildren(...targets.map(t=>{const span=doc.createElement('span'),dot=doc.createElement('i');dot.style.background=t.health>50?'#65ff00':t.health>0?'#ffea00':'#ff343b';span.classList.toggle('offscreen',!t.visible);span.append(dot,doc.createTextNode(t.label+' '+t.health+'%'+(t.visible?'':' · offscreen')));return span;}));previousTargetMarkup=key; }
    if(s.status==='intermission') { setText('feed','Wave cleared · next wave in '+Math.max(1,Math.ceil(s.nextWaveIn||1))+'s');$('feed').className='feed good'; }
    if(s.status==='gameover') { setText('total',(s.score||0).toLocaleString());setText('finalwave',s.wave||1);setText('finalkills',s.kills||0);setText('best',(s.best||0).toLocaleString());setText('record',s.score>lastBest?'NEW PERSONAL BEST':'FINAL SCORE'); }
    if(s.status!==lastStatus){if(s.status==='paused') announce('Game paused.');if(s.status==='gameover') announce('Game over. Your score is '+s.score+'.'); lastStatus=s.status;}
    if(restoreResultFocus)$('restart').focus({preventScroll:true});
    options.onState?.(s);
  }
  function event(e: SwarmEvent) {
    if(destroyed)return;
    if(e.type==='status' && (e.status==='paused'||e.status==='idle'||e.status==='gameover')) {
      // Final damage emits status before gameover: cancel old cues now, then
      // allow the separate descending gameover cue to play through.
      silence(e.status!=='gameover');
      if(e.status==='idle') sessionStarted=false;
    }
    if(e.type==='kill') {tone('kill');feed('+'+e.points+' · '+(e.speedBonus>0?'Fast elimination':'Bug squashed'),'good',3);}
    if(e.type==='hit')tone('hit');
    if(e.type==='bite') {
      tone('bite');
      const now=win.performance?.now?.() ?? Date.now();
      if(now-lastBiteFeedAt>=800) {
        const eaten=Math.min(12,Math.max(0,Number(e.lettersEaten)||0));
        const text=e.full?'12 eaten · button hunter':eaten+'/'+(eaten<6?6:12)+' letters · feeding';
        if(feed(text,'',0))lastBiteFeedAt=now;
      }
    }
    if(e.type==='damage')damageSound(e);
    if(e.type==='evolve')feed(e.tier>=3?'12 eaten · button hunter':'6 eaten · stronger bug','hot',2);
    if(e.type==='wave-start') {
      tone('wave-start');
      const timed=e.reason==='timer';
      banner('WAVE '+String(e.wave||latestState?.wave||1).padStart(2,'0')+'  /  '+(timed?(e.count?'REINFORCEMENTS INBOUND':'PRESSURE RISING'):'CONTAIN THE SWARM'));
      feed(timed?(e.count?'+'+e.count+' incoming · survivors stay active':'Swarm at capacity · keep clearing'):'Squash them before they finish feeding.',timed?'hot':'',2);
    }
    if(e.type==='wave-clear'){tone('wave-clear');feed(e.bonus?'Wave contained · bonus secured':'Wave contained · zap clear','good',3);}
    if(e.type==='rescue'){tone(e.action==='zap'?'kill':'hit');feed(e.action==='zap'?`−${e.cost} · ${e.killed} zapped · +${e.points}`:`−${e.cost} · jumped to base`,'good',4);announce(e.action==='zap'?`Jumped to base. ${e.killed} bugs zapped for ${e.cost} points.`:`Jumped to base for ${e.cost} points.`);}
    if(e.type==='gameover'){tone('gameover');show('banner',false);}
    options.onEvent?.(e);
  }
  // Register before the engine's capture listener, which consumes bug hits.
  // This also unlocks a programmatically started game on its next real input.
  const deferredAudioGesture=(e: Event & {key?: string})=>{
    if(e.key!=='Escape' && sessionStarted && ['running','intermission','paused'].includes(latestState?.status!) && (!audioUnlocked||audioContext?.state!=='running')) unlockAudio(e);
  };
  const visibilityAudio=()=>{if(doc.hidden)silence(true);};
  win.addEventListener('pointerdown',deferredAudioGesture,true);
  win.addEventListener('keydown',deferredAudioGesture,true);
  doc.addEventListener('visibilitychange',visibilityAudio);
  disposers.push(()=>win.removeEventListener('pointerdown',deferredAudioGesture,true),()=>win.removeEventListener('keydown',deferredAudioGesture,true),()=>doc.removeEventListener('visibilitychange',visibilityAudio));
  let engine: SwarmCoreController;
  try { engine=createDomDefender({...options,onState:render,onEvent:event}); }
  catch(error) { destroy(); throw error; }
  const start=(e?: Event)=>{silence(true);cueTimes.clear();warnedTargets.clear();feedPriority=0;feedHoldUntil=0;lastBiteFeedAt=-Infinity;sessionStarted=true;unlockAudio(e);escaped=false;minimized=false;closed=false;lastBest=engine.getSnapshot().best||0;engine.start();render(engine.getSnapshot());};
  const pause=()=>{silence(true);engine.pause();};
  const resume=(e?: Event)=>{if(engine.getSnapshot().status==='paused')unlockAudio(e);engine.resume();};
  const stop=()=>{silence(true);sessionStarted=false;clearTimeout(bannerTimer);clearTimeout(feedTimer);show('banner',false);minimized=false;closed=true;engine.stop();render(engine.getSnapshot());};
  const open=()=>{if(destroyed)return;const wasMinimized=minimized;escaped=false;minimized=false;closed=false;render(engine.getSnapshot());if(destroyed)return;if(engine.getSnapshot().status==='idle')$('start').focus();else if(wasMinimized)$('minimize').focus({preventScroll:true});};
  // Folding the HUD is presentation-only: waves, bugs, score and audio continue.
  const minimize=()=>{if(destroyed||closed||minimized||!['running','intermission','paused'].includes(engine.getSnapshot().status))return;minimized=true;clearTimeout(bannerTimer);show('banner',false);render(engine.getSnapshot());if(!destroyed&&minimized)$('launcher').focus({preventScroll:true});};
  const closeByPlayer=()=>{stop();options.onClose?.();};
  // Capture before the core's legacy pause shortcut. Keep Escape available to
  // the page too, so an open native dialog can close in the same keypress.
  const exitOnEscape=(e: KeyboardEvent)=>{if(destroyed||e.key!=='Escape'||e.repeat||e.isComposing)return;escaped=true;stop();announce('');};
  doc.addEventListener('keydown',exitOnEscape,true);
  disposers.push(()=>doc.removeEventListener('keydown',exitOnEscape,true));
  on('launcher',open);
  on('close',closeByPlayer);on('start',start);on('restart',start);on('restore',closeByPlayer);on('quit',closeByPlayer);on('pause',pause);on('resume',resume);on('minimize',minimize);
  on('sound',e=>{sound=!sound;silence(!sound);try{win.localStorage.setItem(soundKey,sound?'on':'off');}catch(_){}soundButton();if(sound){unlockAudio(e);tone('preview');}});
  function destroy(){if(destroyed)return;destroyed=true;minimized=false;silence(true);clearTimeout(bannerTimer);clearTimeout(feedTimer);engine?.destroy();disposers.forEach(fn=>fn());try{masterGain?.disconnect();}catch(_){}if(audioContext)audioContext.close().catch(()=>{});root.replaceChildren();for(const name of hostFlags.keys())host.removeAttribute(name);hostFlags.clear();}
  // A consumer can throw in the first onState call, before receiving a handle.
  // Release the already-created engine/listeners, then preserve that exception.
  try { soundButton(); render(engine.getSnapshot()); }
  catch(error) { destroy(); throw error; }
  return { open,start,pause,resume,stop,minimize,destroy,getSnapshot:()=>engine.getSnapshot() };
}
