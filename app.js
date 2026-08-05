/* ============ PAÍSES ============ */
const COUNTRIES = [
  { name:'Brasil',          flag:'🇧🇷', genero:'m' },
  { name:'Argentina',       flag:'🇦🇷', genero:'f' },
  { name:'Estados Unidos',  flag:'🇺🇸', genero:'m' },
  { name:'Itália',          flag:'🇮🇹', genero:'f' },
  { name:'França',          flag:'🇫🇷', genero:'f' },
  { name:'Japão',           flag:'🇯🇵', genero:'m' },
  { name:'Austrália',       flag:'🇦🇺', genero:'f' },
  { name:'África do Sul',   flag:'🇿🇦', genero:'f' },
];
function countryLabel(c) { return `${c.flag} ${c.name}`; }
function championPhrase(team) {
  return team.genero === 'm'
    ? { art:'o', novo:'novo', campeao:'campeão' }
    : { art:'a', novo:'nova', campeao:'campeã' };
}
let championReturnScreen = 'screen-menu';
let selectedCountry = 'random';
function pickHumanCountry(teamsShuffled) {
  if (selectedCountry !== 'random') {
    const idx = teamsShuffled.findIndex(c => c.name === selectedCountry);
    if (idx > 0) { const tmp = teamsShuffled[0]; teamsShuffled[0] = teamsShuffled[idx]; teamsShuffled[idx] = tmp; }
  }
  return teamsShuffled[0];
}

/* ============ ESTADO GLOBAL ============ */
const emojis = { pedra:'✊', papel:'✋', tesoura:'✌️' };
const beats = { pedra:'tesoura', papel:'pedra', tesoura:'papel' };
const stageNames = ['Quartas de Final', 'Semifinal', 'Final'];

let difficulty = 'medio';
let trackSetting = 'random';

let history = { wins:0, losses:0, titles:{ tournament:{bo3:0,bo5:0}, league:{bo3:0,bo5:0} } };

let matchHistoryMoves = [];
let matchDifficilSequence = [];
let difficilIndex = 0;
let matchPlayer = 0, matchIA = 0, roundsToWin = 2;
let currentFlow = null;
let tournamentState = null;
let leagueState = null;
let roundTimerTimeout = null, roundTimerInterval = null;
let roundLocked = false;
let audioStarted = false;

/* ============ ÁUDIO: infraestrutura ============ */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

const SEMITONES = {C:-9,'C#':-8,D:-7,'D#':-6,E:-5,F:-4,'F#':-3,G:-2,'G#':-1,A:0,'A#':1,B:2};
function noteFreq(name, octave) {
  const semitone = SEMITONES[name] + (octave-4)*12;
  return 440 * Math.pow(2, semitone/12);
}

let sharedNoiseBuffer = null;
function getNoiseBuffer(ctx) {
  if (!sharedNoiseBuffer) {
    const size = ctx.sampleRate * 0.3;
    const buf = ctx.createBuffer(1, size, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i=0;i<size;i++) d[i] = Math.random()*2-1;
    sharedNoiseBuffer = buf;
  }
  return sharedNoiseBuffer;
}

/* ---- trilha pop-rock (bateria + baixo + teclado + guitarra) ---- */
let musicNodes = [];
let musicMasterGain = null;
let musicLoopTimeout = null;
let musicGeneration = 0;

function stopMusic(fadeSec) {
  fadeSec = fadeSec === undefined ? 0.15 : fadeSec;
  musicGeneration++; // invalida qualquer ciclo pendente da faixa anterior
  clearTimeout(musicLoopTimeout);
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  if (musicMasterGain) {
    const g = musicMasterGain;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
  }
  const stopAt = now + fadeSec + 0.03;
  // corta as notas antigas exatamente no relógio de áudio (não por setTimeout),
  // evitando que sobrem notas "penduradas" tocando por cima da faixa nova
  musicNodes.forEach(n => { try { n.stop(stopAt); } catch(e){} });
  musicNodes = [];
  musicMasterGain = null;
  return stopAt;
}

function playKick(ctx, master, t) {
  const osc = ctx.createOscillator(); osc.type='sine';
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(45, t+0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.55, t);
  g.gain.exponentialRampToValueAtTime(0.001, t+0.22);
  osc.connect(g); g.connect(master);
  osc.start(t); osc.stop(t+0.25);
  musicNodes.push(osc);
}
function playSnare(ctx, master, t) {
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter(); filter.type='highpass'; filter.frequency.value=1200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.32, t);
  g.gain.exponentialRampToValueAtTime(0.001, t+0.15);
  src.connect(filter); filter.connect(g); g.connect(master);
  src.start(t); src.stop(t+0.16);
  musicNodes.push(src);
}
function playHihat(ctx, master, t, vol) {
  const src = ctx.createBufferSource(); src.buffer = getNoiseBuffer(ctx);
  const filter = ctx.createBiquadFilter(); filter.type='highpass'; filter.frequency.value=6500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t+0.05);
  src.connect(filter); filter.connect(g); g.connect(master);
  src.start(t); src.stop(t+0.06);
  musicNodes.push(src);
}
function playBassNote(ctx, master, f, t, dur, wave, filterFreq) {
  const osc = ctx.createOscillator(); osc.type = wave || 'sawtooth'; osc.frequency.value=f;
  const filter = ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value = filterFreq || 420;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.24, t+0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t+dur);
  osc.connect(filter); filter.connect(g); g.connect(master);
  osc.start(t); osc.stop(t+dur+0.02);
  musicNodes.push(osc);
}
function playGuitarStab(ctx, master, freqs, t, dur, waves, detune) {
  const w = waves || ['sawtooth','square'];
  const det = detune === undefined ? 0.004 : detune;
  freqs.forEach(f => {
    const osc = ctx.createOscillator(); osc.type=w[0]; osc.frequency.value=f;
    const osc2 = ctx.createOscillator(); osc2.type=w[1]; osc2.frequency.value=f*(1+det);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.15, t+0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    osc.connect(g); osc2.connect(g); g.connect(master);
    osc.start(t); osc2.start(t);
    osc.stop(t+dur+0.02); osc2.stop(t+dur+0.02);
    musicNodes.push(osc, osc2);
  });
}
function playGuitarChug(ctx, master, freqs, t, dur, wave) {
  // hit curto e abafado (estilo "palm mute"): filtro fechado + decaimento rápido
  freqs.forEach(f => {
    const osc = ctx.createOscillator(); osc.type = wave || 'square'; osc.frequency.value=f;
    const filter = ctx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.16, t+0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    osc.connect(filter); filter.connect(g); g.connect(master);
    osc.start(t); osc.stop(t+dur+0.02);
    musicNodes.push(osc);
  });
}
function playGuitarArpeggio(ctx, master, freqs, t, stepDur, wave) {
  freqs.forEach((f, idx) => {
    const noteT = t + idx*stepDur*0.85;
    const osc = ctx.createOscillator(); osc.type = wave || 'triangle'; osc.frequency.value=f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, noteT);
    g.gain.linearRampToValueAtTime(0.13, noteT+0.02);
    g.gain.exponentialRampToValueAtTime(0.001, noteT+stepDur*0.9);
    osc.connect(g); g.connect(master);
    osc.start(noteT); osc.stop(noteT+stepDur+0.05);
    musicNodes.push(osc);
  });
}
function playLeadNote(ctx, master, f, t, dur, wave) {
  const osc = ctx.createOscillator(); osc.type = wave || 'square'; osc.frequency.value=f;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.12, t+0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t+dur);
  osc.connect(g); g.connect(master);
  osc.start(t); osc.stop(t+dur+0.02);
  musicNodes.push(osc);
}

function scheduleSection(ctx, master, cfg, chord, t0, dur, isLast, sectionIndex) {
  const rootF = noteFreq(chord.root, cfg.octave);
  const thirdF = rootF * Math.pow(2, (chord.type==='min'?3:4)/12);
  const fifthF = rootF * Math.pow(2, 7/12);
  const bassRootF = noteFreq(chord.root, cfg.octave-1);
  const bassThirdF = bassRootF * Math.pow(2, (chord.type==='min'?3:4)/12);
  const bassFifthF = bassRootF * Math.pow(2, 7/12);
  const degFreq = (deg) => deg===1 ? bassThirdF : deg===2 ? bassFifthF : bassRootF;

  const steps = cfg.subdivisions;
  const stepDur = dur/steps;
  const stepTime = (i) => t0 + i*stepDur + (cfg.swing && i%2===1 ? stepDur*cfg.swing : 0);

  // teclado (acorde sustentado, polifônico) — voicing varia por faixa
  const padNotes = cfg.padVoicing==='open' ? [rootF, fifthF, rootF*2] : [rootF, thirdF, fifthF];
  padNotes.forEach(f => {
    const osc = ctx.createOscillator(); osc.type='triangle'; osc.frequency.value=f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0+0.15);
    g.gain.setValueAtTime(0.05, t0+dur-0.3);
    g.gain.linearRampToValueAtTime(0, t0+dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0+dur+0.05);
    musicNodes.push(osc);
  });

  // bateria — padrão próprio de cada faixa
  cfg.kickSteps.forEach(s => playKick(ctx, master, stepTime(s)));
  cfg.snareSteps.forEach(s => playSnare(ctx, master, stepTime(s)));
  for (let i=0;i<steps;i++) {
    if (cfg.hihatSteps.includes(i)) playHihat(ctx, master, stepTime(i), i%2===0?0.05:0.03);
  }

  // contrabaixo — ritmo, notas (grau do acorde) e timbre próprios
  cfg.bassPattern.forEach(bp => {
    playBassNote(ctx, master, degFreq(bp.deg||0), stepTime(bp.step), stepDur*bp.len*0.9, cfg.bassWave, cfg.bassFilter);
  });

  // guitarra — técnica (stab/chug/arpejo) e timbre próprios
  cfg.guitarPattern.forEach(gp => {
    if (gp.type === 'chug') playGuitarChug(ctx, master, [rootF, fifthF], stepTime(gp.step), stepDur*(gp.len||0.4), cfg.guitarWave && cfg.guitarWave[0]);
    else if (gp.type === 'arpeggio') playGuitarArpeggio(ctx, master, [rootF, thirdF, fifthF], stepTime(gp.step), stepDur*(gp.len||1), cfg.guitarWave && cfg.guitarWave[0]);
    else playGuitarStab(ctx, master, [rootF, fifthF], stepTime(gp.step), stepDur*(gp.len||1.6), cfg.guitarWave, cfg.guitarDetune);
  });

  // riff (gancho melódico) — posição varia: início, fim, ambos, ou em toda seção
  const totalSections = cfg.progression.length;
  const playRiffHere =
    cfg.riff && (
      cfg.riffPlacement === 'throughout' ||
      (cfg.riffPlacement === 'end' && isLast) ||
      (cfg.riffPlacement === 'start' && sectionIndex === 0) ||
      (cfg.riffPlacement === 'both' && (sectionIndex === 0 || isLast))
    );
  if (playRiffHere) {
    const riffNotes = cfg.riffPlacement === 'throughout' ? cfg.riff.slice(0,2) : cfg.riff;
    riffNotes.forEach((note, idx) => {
      const t = t0 + dur - riffNotes.length*stepDur*0.5 + idx*stepDur*0.5;
      playLeadNote(ctx, master, noteFreq(note.n, note.o), t, stepDur*0.45, cfg.riffWave);
    });
  }
}

function playPopRockTrack(cfg) {
  const startAt = stopMusic(0.15); // corta a faixa antiga e diz exatamente quando ela fica muda
  const myGeneration = musicGeneration;
  const ctx = getAudioCtx();
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, startAt);
  master.gain.linearRampToValueAtTime(0.16, startAt + 0.5);
  master.connect(ctx.destination);
  musicMasterGain = master;

  function scheduleCycle(cycleStart) {
    if (myGeneration !== musicGeneration) return; // outra faixa assumiu — não agenda mais nada por cima
    const ctx2 = getAudioCtx();
    const sectionDur = 20 / cfg.progression.length;
    cfg.progression.forEach((chord, si) => {
      scheduleSection(ctx2, master, cfg, chord, cycleStart + si*sectionDur, sectionDur, si===cfg.progression.length-1, si);
    });
    // Próximo ciclo sempre continua exatamente 20s depois do início matemático deste,
    // nunca a partir de "agora" — isso evita o desvio acumulado (drift) que fazia a
    // cauda de um ciclo tocar por cima da cabeça do próximo, com baixo e bateria
    // parecendo em compassos diferentes.
    const nextCycleStart = cycleStart + 20;
    const lookaheadMs = Math.max(0, (nextCycleStart - getAudioCtx().currentTime - 1) * 1000);
    musicLoopTimeout = setTimeout(() => {
      if (myGeneration === musicGeneration) scheduleCycle(nextCycleStart);
    }, lookaheadMs);
  }
  scheduleCycle(startAt); // a faixa nova começa exatamente no instante em que a antiga fica silenciosa
}

const MATCH_TRACKS = [
  { // Track 1 — rock de estádio: batida quatro-por-quatro, guitarra sincopada em "stabs"
    name:'Estádio Elétrico', octave:3, subdivisions:8, swing:0,
    progression:[{root:'E',type:'min'},{root:'C',type:'maj'},{root:'G',type:'maj'},{root:'D',type:'maj'}],
    kickSteps:[0,2,4,6], snareSteps:[2,6], hihatSteps:[0,1,2,3,4,5,6,7],
    bassPattern:[{step:0,len:2,deg:0},{step:2,len:2,deg:0},{step:4,len:2,deg:0},{step:6,len:2,deg:2}],
    bassWave:'sawtooth', bassFilter:420,
    guitarPattern:[{step:0,len:1.5,type:'stab'},{step:3,len:1,type:'stab'},{step:6,len:1.5,type:'stab'}],
    guitarWave:['sawtooth','square'], guitarDetune:0.004,
    padVoicing:'triad',
    riff:[{n:'E',o:4},{n:'G',o:4},{n:'A',o:4},{n:'B',o:4}], riffPlacement:'end', riffWave:'square' },

  { // Track 2 — punk/pop-rock acelerado: kick "galope", palhetada abafada (chug) contínua
    name:'Corrida Final', octave:3, subdivisions:8, swing:0,
    progression:[{root:'A',type:'min'},{root:'F',type:'maj'},{root:'C',type:'maj'},{root:'G',type:'maj'}],
    kickSteps:[0,1,4,5], snareSteps:[2,6], hihatSteps:[0,2,4,6],
    bassPattern:[{step:0,len:1,deg:0},{step:1,len:1,deg:0},{step:2,len:1,deg:2},{step:3,len:1,deg:0},
                 {step:4,len:1,deg:0},{step:5,len:1,deg:0},{step:6,len:1,deg:2},{step:7,len:1,deg:0}],
    bassWave:'square', bassFilter:520,
    guitarPattern:[0,1,2,3,4,5,6,7].map(s => ({step:s, len:0.42, type:'chug'})),
    guitarWave:['square','square'], guitarDetune:0.006,
    padVoicing:'open',
    riff:[{n:'A',o:4},{n:'C',o:5},{n:'D',o:5},{n:'E',o:5}], riffPlacement:'start', riffWave:'sawtooth' },

  { // Track 3 — anthemic/half-time: grade de 6 tempos (feel diferente), guitarra em arpejo, contrabaixo em notas longas
    name:'Arena Livre', octave:3, subdivisions:6, swing:0,
    progression:[{root:'D',type:'maj'},{root:'A',type:'maj'},{root:'B',type:'min'},{root:'G',type:'maj'}],
    kickSteps:[0,3], snareSteps:[3], hihatSteps:[0,1,2,3,4,5],
    bassPattern:[{step:0,len:3,deg:0},{step:3,len:3,deg:2}],
    bassWave:'triangle', bassFilter:700,
    guitarPattern:[{step:0,len:2.5,type:'arpeggio'}],
    guitarWave:['sawtooth'], guitarDetune:0,
    padVoicing:'triad',
    riff:[{n:'D',o:5},{n:'A',o:4}], riffPlacement:'throughout', riffWave:'triangle' },
];

const MENU_TRACK = { // tema do menu — mais aberto e melódico, timbres mais limpos, gancho no início e no fim
  name:'Menu Rock', octave:3, subdivisions:8, swing:0,
  progression:[{root:'G',type:'maj'},{root:'E',type:'min'},{root:'C',type:'maj'},{root:'D',type:'maj'}],
  kickSteps:[0,4], snareSteps:[2,6], hihatSteps:[0,2,4,6],
  bassPattern:[{step:0,len:2,deg:0},{step:2,len:2,deg:1},{step:4,len:2,deg:2},{step:6,len:2,deg:1}],
  bassWave:'sawtooth', bassFilter:320,
  guitarPattern:[{step:0,len:1.2,type:'arpeggio'},{step:4,len:1.2,type:'arpeggio'}],
  guitarWave:['triangle'], guitarDetune:0,
  padVoicing:'triad',
  riff:[{n:'G',o:4},{n:'B',o:4},{n:'C',o:5},{n:'D',o:5}], riffPlacement:'both', riffWave:'square' };


function ensureMenuMusicPlaying() {
  getAudioCtx();
  if (!musicMasterGain && trackSetting !== 'off') playPopRockTrack(MENU_TRACK);
}
function pickMatchTrackIndex() {
  if (trackSetting === 'off') return null;
  if (trackSetting === 'random') return Math.floor(Math.random()*3);
  return parseInt(trackSetting, 10);
}
function startFlowMusic() {
  const idx = pickMatchTrackIndex();
  if (idx === null) { stopMusic(0.3); return; }
  playPopRockTrack(MATCH_TRACKS[idx]);
}

/* ---- fanfarra de campeão (10s, isolada) ---- */
function playFanfare(onDone) {
  stopMusic(0.2);
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);

  function note(freq, t, d) {
    const osc = ctx.createOscillator(); osc.type='sawtooth'; osc.frequency.value=freq;
    const osc2 = ctx.createOscillator(); osc2.type='square'; osc2.frequency.value=freq*1.005;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now+t);
    g.gain.linearRampToValueAtTime(0.28, now+t+0.04);
    g.gain.exponentialRampToValueAtTime(0.001, now+t+d);
    osc.connect(g); osc2.connect(g); g.connect(master);
    osc.start(now+t); osc2.start(now+t);
    osc.stop(now+t+d+0.05); osc2.stop(now+t+d+0.05);
  }
  const N = { C5:523.25, D5:587.33, E5:659.25, F5:698.46, G5:783.99, A5:880.00, B5:987.77, C6:1046.50, D6:1174.66, E6:1318.51 };
  note(N.C5,0.0,0.28); note(N.E5,0.28,0.28); note(N.G5,0.56,0.28); note(N.C6,0.84,0.55);
  note(N.G5,1.5,0.25); note(N.C6,1.75,0.6);
  note(N.D5,2.5,0.25); note(N.F5,2.75,0.25); note(N.A5,3.0,0.25); note(N.D6,3.28,0.55);
  note(N.A5,3.95,0.22); note(N.D6,4.18,0.55);
  note(N.C5,5.0,0.22); note(N.E5,5.22,0.22); note(N.G5,5.44,0.22); note(N.C6,5.66,0.22);
  note(N.E6,5.9,0.6); note(N.C6,6.55,0.5);
  [N.C5,N.E5,N.G5,N.C6,N.E6].forEach(f => note(f,7.3,2.6));

  setTimeout(() => { try{ master.disconnect(); }catch(e){} if (onDone) onDone(); }, 10000);
}

/* ============ IA ============ */
function randomChoiceRPS() { const o=['pedra','papel','tesoura']; return o[Math.floor(Math.random()*3)]; }
function iaChoiceFacil() { return randomChoiceRPS(); }
function iaChoiceMedio() {
  if (matchHistoryMoves.length === 0 || Math.random() < 0.5) return iaChoiceFacil();
  const last = matchHistoryMoves[matchHistoryMoves.length - 1];
  const counters = { pedra:'papel', papel:'tesoura', tesoura:'pedra' };
  return counters[last];
}
function iaChoiceDificil() {
  if (difficilIndex >= matchDifficilSequence.length) matchDifficilSequence.push(randomChoiceRPS());
  return matchDifficilSequence[difficilIndex++];
}
function getIAChoice() {
  if (difficulty === 'facil') return iaChoiceFacil();
  if (difficulty === 'dificil') return iaChoiceDificil();
  return iaChoiceMedio();
}

/* ============ UTIL ============ */
function shuffle(arr) {
  const a = arr.slice();
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function updateHistoryDisplay() {
  document.getElementById('histWins').textContent = history.wins;
  document.getElementById('histLosses').textContent = history.losses;
  const t = history.titles;
  document.getElementById('histTournamentBo3').textContent = t.tournament.bo3;
  document.getElementById('histTournamentBo5').textContent = t.tournament.bo5;
  document.getElementById('histLeagueBo3').textContent = t.league.bo3;
  document.getElementById('histLeagueBo5').textContent = t.league.bo5;
}
function goToMenu() {
  if (trackSetting !== 'off') playPopRockTrack(MENU_TRACK);
  else stopMusic(0.3);
  showScreen('screen-menu');
}
function simulateMatchScore(bo) {
  const narrow = Math.random() < 0.4;
  if (bo === 3) return narrow ? [2,1] : [2,0];
  return narrow ? [3,2] : (Math.random()<0.5 ? [3,0] : [3,1]);
}
function matchPoints(wScore, lScore, bo) {
  const narrow = (bo===3 && lScore===1) || (bo===5 && lScore===2);
  return narrow ? { winner:2, loser:1 } : { winner:3, loser:0 };
}
function applyResult(winner, loser, wScore, lScore, bo) {
  const pts = matchPoints(wScore, lScore, bo);
  winner.pts += pts.winner; winner.w++; winner.played++;
  loser.pts += pts.loser; loser.l++; loser.played++;
}
function simulateMatchupCountry(a, b, bo) {
  const aWins = Math.random() < 0.5;
  const [wScore, lScore] = simulateMatchScore(bo);
  const winner = aWins ? a : b, loser = aWins ? b : a;
  return { a, b, winner, loser, wScore, lScore };
}
function simulateAIMatch(a, b, bo) {
  const r = simulateMatchupCountry(a, b, bo);
  applyResult(r.winner, r.loser, r.wScore, r.lScore, bo);
  return r;
}

/* ============ MENU: eventos ============ */
function renderCountryRow() {
  const row = document.getElementById('countryRow');
  let html = `<button class="pill-btn ${selectedCountry==='random'?'active':''}" data-country="random" style="flex:0 0 100%;margin-bottom:4px;">🎲 Aleatória (a máquina escolhe)</button>`;
  COUNTRIES.forEach(c => {
    html += `<button class="pill-btn ${selectedCountry===c.name?'active':''}" data-country="${c.name}" style="flex:1 1 45%;min-width:120px;">${c.flag} ${c.name}</button>`;
  });
  row.innerHTML = html;
  row.querySelectorAll('.pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCountry = btn.dataset.country;
      renderCountryRow();
      ensureMenuMusicPlaying();
    });
  });
}
renderCountryRow();

document.querySelectorAll('#diffRow .pill-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#diffRow .pill-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    difficulty = btn.dataset.diff;
    ensureMenuMusicPlaying();
  });
});
document.querySelectorAll('#trackRow .pill-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#trackRow .pill-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    trackSetting = btn.dataset.track;
    if (trackSetting === 'off') stopMusic(0.4);
    else ensureMenuMusicPlaying();
  });
});
document.getElementById('resetHistoryBtn').addEventListener('click', () => {
  history = { wins:0, losses:0, titles:{ tournament:{bo3:0,bo5:0}, league:{bo3:0,bo5:0} } };
  updateHistoryDisplay();
});
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    getAudioCtx();
    const mode = btn.dataset.mode, bo = parseInt(btn.dataset.bo, 10);
    if (mode === 'quick') startQuickMatch(bo);
    else if (mode === 'tournament') startTournament(bo);
    else startLeague(bo);
  });
});
document.querySelector('.app').addEventListener('click', function firstClickHandler(e) {
  if (audioStarted) return;
  audioStarted = true;
  getAudioCtx();
  const isModeBtn = e.target.closest('.mode-btn');
  if (!isModeBtn && document.getElementById('screen-menu').classList.contains('active') && trackSetting !== 'off') {
    ensureMenuMusicPlaying();
  }
}, { capture:true, once:true });

/* ============ PARTIDA RÁPIDA ============ */
function startQuickMatch(bo) {
  const teams = shuffle(COUNTRIES.map(c => ({...c})));
  const human = pickHumanCountry(teams); human.isHuman = true;
  const opponent = teams[1];
  currentFlow = { type:'quick', bo, opponentTeam: opponent, humanTeam: human };
  startFlowMusic();
  beginMatch(bo, `Partida Rápida — Melhor de ${bo}`);
}

/* ============ TORNEIO ============ */
function startTournament(bo) {
  const teams = shuffle(COUNTRIES.map(c => ({...c})));
  const human = pickHumanCountry(teams);
  human.isHuman = true;
  const p = teams;
  const matches = {
    qf1: { a:p[0], b:p[1], result:null, isPlayerMatch:true },
    qf2: { a:p[2], b:p[3], result:null },
    qf3: { a:p[4], b:p[5], result:null },
    qf4: { a:p[6], b:p[7], result:null },
    sf1: { a:null, b:null, result:null, isPlayerMatch:true },
    sf2: { a:null, b:null, result:null },
    final: { a:null, b:null, result:null, isPlayerMatch:true },
  };
  simulateIntoMatch(matches.qf2, bo);
  simulateIntoMatch(matches.qf3, bo);
  simulateIntoMatch(matches.qf4, bo);
  // As semifinais só têm seus PARTICIPANTES definidos agora (times já conhecidos);
  // o RESULTADO da semifinal só é decidido depois que a rodada de quartas terminar.
  matches.sf1.b = matches.qf2.result.winner;
  matches.sf2.a = matches.qf3.result.winner;
  matches.sf2.b = matches.qf4.result.winner;

  tournamentState = {
    bo, humanTeam: p[0], matches, stage:'qf1', finished:false, championTeam:null, eliminatedNote:null
  };
  startFlowMusic();
  showBracketScreen();
}

function simulateIntoMatch(m, bo) {
  const r = simulateMatchupCountry(m.a, m.b, bo);
  m.result = { winner:r.winner, loser:r.loser, wScore:r.wScore, lScore:r.lScore };
}

function renderMatchRow(m, isCurrentLive) {
  const aLabel = m.a ? countryLabel(m.a) : 'A definir';
  const bLabel = m.b ? countryLabel(m.b) : 'A definir';
  let mid = 'vs';
  let resultLine = '';
  if (m.result) {
    const aIsWinner = m.result.winner === m.a;
    mid = `${aIsWinner ? m.result.wScore : m.result.lScore} x ${aIsWinner ? m.result.lScore : m.result.wScore}`;
    const tag = m.isPlayerMatch ? 'seu jogo' : 'simulado';
    resultLine = `<div style="text-align:right;font-size:0.62rem;opacity:0.55;margin:-2px 0 8px;">🏅 ${countryLabel(m.result.winner)} <span style="opacity:0.7;">(${tag})</span></div>`;
  }
  return `<div class="matchup ${isCurrentLive?'current':''}">
    <span>${aLabel}</span><span class="vsmini">${mid}</span><span>${bLabel}</span>
  </div>${resultLine}`;
}

function showBracketScreen() {
  const st = tournamentState;
  const m = st.matches;
  document.getElementById('bracketStageBadge').textContent = `Torneio — Melhor de ${st.bo}`;
  let html = '';
  html += `<div class="bracket-stage"><h3>Quartas de Final</h3>`;
  html += renderMatchRow(m.qf1, st.stage==='qf1' && !st.finished);
  html += renderMatchRow(m.qf2, false);
  html += renderMatchRow(m.qf3, false);
  html += renderMatchRow(m.qf4, false);
  html += `</div>`;
  html += `<div class="bracket-stage"><h3>Semifinal</h3>`;
  html += renderMatchRow(m.sf1, st.stage==='sf1' && !st.finished);
  html += renderMatchRow(m.sf2, false);
  html += `</div>`;
  html += `<div class="bracket-stage"><h3>Final</h3>`;
  html += renderMatchRow(m.final, st.stage==='final' && !st.finished);
  html += `</div>`;
  if (st.finished) {
    const gp = championPhrase(st.championTeam);
    const fr = m.final.result;
    const scoreTxt = fr ? ` Placar da Final: ${countryLabel(fr.winner)} ${fr.wScore} x ${fr.lScore} ${countryLabel(fr.loser)}.` : '';
    html += `<div class="panel" style="text-align:center;">🏆 <strong>${countryLabel(st.championTeam)}</strong> é ${gp.art} ${gp.campeao} do Torneio (Melhor de ${st.bo})!${scoreTxt}
      ${st.eliminatedNote ? `<br><span style="opacity:0.75;font-size:0.78rem;">${st.eliminatedNote}</span>` : ''}</div>`;
  }
  document.getElementById('bracketContent').innerHTML = html;
  document.getElementById('bracketContinueBtn').textContent = st.finished ? 'Voltar ao Menu' : (st.stage==='qf1' ? 'Começar Torneio' : 'Continuar');
  showScreen('screen-bracket');
}

document.getElementById('bracketContinueBtn').addEventListener('click', () => {
  const st = tournamentState;
  if (st.finished) { goToMenu(); return; }
  const stageKey = st.stage;
  const m = st.matches[stageKey];
  const opponentTeam = m.a.isHuman ? m.b : m.a;
  currentFlow = { type:'tournament', bo: st.bo, opponentTeam, humanTeam: st.humanTeam, stageKey };
  const label = stageKey==='qf1' ? 'Quartas de Final' : (stageKey==='sf1' ? 'Semifinal' : 'Final');
  beginMatch(st.bo, `Torneio — ${label}`);
});

function announceTournamentChampion(st) {
  showBracketScreen(); // garante que a tabela final já esteja pronta por trás da plaqueta
  championReturnScreen = 'screen-bracket';
  const champ = st.championTeam;
  const gp = championPhrase(champ);
  const fr = st.matches.final.result;
  const scoreTxt = fr ? `Placar da Final: ${countryLabel(fr.winner)} ${fr.wScore} x ${fr.lScore} ${countryLabel(fr.loser)}.` : '';
  if (champ.isHuman) {
    history.titles.tournament[st.bo===5?'bo5':'bo3']++;
    updateHistoryDisplay();
    document.getElementById('championTitleEl').textContent = `🎉 ${gp.campeao.toUpperCase()} DO TORNEIO! 🎉`;
    document.getElementById('championSub').textContent =
      `${countryLabel(champ)} venceu Quartas, Semifinal e Final e é ${gp.art} ${gp.novo} ${gp.campeao} do Torneio (Melhor de ${st.bo})! ${scoreTxt}`;
    showScreen('screen-champion'); buildConfetti();
    playFanfare(() => { setTimeout(() => { if (trackSetting !== 'off') playPopRockTrack(MENU_TRACK); }, 2000); });
  } else {
    document.getElementById('championTitleEl').textContent = `🏆 ${gp.campeao.toUpperCase()} DO TORNEIO: ${countryLabel(champ)}! 🏆`;
    document.getElementById('championSub').textContent =
      `${countryLabel(champ)} é ${gp.art} ${gp.campeao} do Torneio (Melhor de ${st.bo})! ${scoreTxt}`;
    if (trackSetting !== 'off') playPopRockTrack(MENU_TRACK); else stopMusic(0.4);
    showScreen('screen-champion');
  }
}

function finishTournamentAsEliminated(st, stageLabel, stageArticle) {
  st.finished = true;
  st.championTeam = st.matches.final.result.winner;
  const eliminationText = `${countryLabel(st.humanTeam)} foi eliminado(a) ${stageArticle} ${stageLabel} pelo ${countryLabel(currentFlow.opponentTeam)}. Placar: ${matchPlayer} — ${matchIA}.`;
  st.eliminatedNote = eliminationText;

  document.getElementById('gameoverSub').textContent = eliminationText;
  document.getElementById('gameoverMenuBtn').textContent = 'Ok';
  document.getElementById('gameoverMenuBtn').onclick = () => {
    announceTournamentChampion(st);
  };
  showScreen('screen-gameover');
}

/* ============ LIGA ============ */
function buildRoundRobinSchedule(teams) {
  const n = teams.length;
  const fixed = teams[0];
  let rotating = teams.slice(1);
  const turno = [];
  for (let r=0;r<n-1;r++) {
    const current = [fixed, ...rotating];
    const round = [];
    for (let i=0;i<n/2;i++) round.push({ a: current[i], b: current[n-1-i] });
    turno.push(round);
    rotating.unshift(rotating.pop());
  }
  const returno = turno.map(round => round.map(m => ({ a:m.b, b:m.a })));
  return [...turno, ...returno];
}

function startLeague(bo) {
  const teams = shuffle(COUNTRIES.map(c => ({...c, pts:0, w:0, l:0, played:0})));
  const human = pickHumanCountry(teams);
  human.isHuman = true;
  const schedule = buildRoundRobinSchedule(teams);
  leagueState = { bo, teams, schedule, roundIndex:0, humanTeam: human };
  startFlowMusic();
  showLeagueIntro();
}

function renderStandingsTable(teams) {
  const sorted = teams.slice().sort((a,b) => b.pts-a.pts || b.w-a.w);
  let html = `<div class="panel"><h2>Tabela</h2><table>
    <tr style="opacity:0.6;"><td>Time</td><td>Pts</td><td>V</td><td>D</td><td>J</td></tr>`;
  sorted.forEach(t => {
    html += `<tr style="${t.isHuman?'font-weight:bold;color:#facc15;':''}">
      <td>${countryLabel(t)}</td><td>${t.pts}</td><td>${t.w}</td><td>${t.l}</td><td>${t.played}</td>
    </tr>`;
  });
  html += `</table></div>`;
  return html;
}
function renderRoundMatchesPreview(round, humanTeam) {
  let html = `<div class="panel"><h2>Confrontos da Rodada</h2>`;
  round.forEach(m => {
    const isHuman = m.a===humanTeam || m.b===humanTeam;
    html += `<div class="matchup ${isHuman?'current':''}">
      <span>${countryLabel(m.a)}</span><span class="vsmini">vs</span><span>${countryLabel(m.b)}</span>
    </div>`;
  });
  html += `</div>`;
  return html;
}
function matchResultRow(winner, loser, wScore, lScore, isHuman) {
  return `<div class="matchup ${isHuman?'current':''}">
    <span>${countryLabel(winner)} ${wScore}</span><span class="vsmini">x</span><span>${lScore} ${countryLabel(loser)}</span>
    <span style="font-size:0.6rem;opacity:0.6;">${isHuman?'seu jogo':'simulado'}</span>
  </div>`;
}
function renderRoundResults(simResults, humanResult) {
  let html = `<div class="panel"><h2>Resultados da Rodada</h2>`;
  html += matchResultRow(humanResult.winner, humanResult.loser, humanResult.wScore, humanResult.lScore, true);
  simResults.forEach(r => { html += matchResultRow(r.winner, r.loser, r.wScore, r.lScore, false); });
  html += `</div>`;
  return html;
}

function showLeagueIntro() {
  const st = leagueState;
  document.getElementById('leagueStageBadge').textContent = `Liga — Melhor de ${st.bo}`;
  document.getElementById('leagueTitle').textContent = `Você joga por ${countryLabel(st.humanTeam)}!`;
  document.getElementById('leagueTableWrap').innerHTML = renderStandingsTable(st.teams);
  document.getElementById('leagueMatchesWrap').innerHTML = renderRoundMatchesPreview(st.schedule[0], st.humanTeam);
  document.getElementById('leagueContinueBtn').textContent = 'Começar Liga';
  document.getElementById('leagueContinueBtn').onclick = () => startLeagueRound();
  showScreen('screen-league');
}

function startLeagueRound() {
  const st = leagueState;
  const round = st.schedule[st.roundIndex];
  const humanMatch = round.find(m => m.a===st.humanTeam || m.b===st.humanTeam);
  const results = [];
  round.forEach(m => { if (m !== humanMatch) results.push(simulateAIMatch(m.a, m.b, st.bo)); });
  st.currentRoundResults = results;
  const oppTeam = humanMatch.a===st.humanTeam ? humanMatch.b : humanMatch.a;
  currentFlow = { type:'league', bo: st.bo, opponentTeam: oppTeam, humanTeam: st.humanTeam };
  const half = st.roundIndex < 7 ? 'Turno' : 'Returno';
  const roundInHalf = (st.roundIndex % 7) + 1;
  beginMatch(st.bo, `Liga — ${half} · Rodada ${roundInHalf}`);
}

function showLeagueRoundSummary() {
  const st = leagueState;
  const half = st.roundIndex < 7 ? 'Turno' : 'Returno';
  const roundInHalf = (st.roundIndex % 7) + 1;
  document.getElementById('leagueStageBadge').textContent = `Liga — Melhor de ${st.bo}`;
  document.getElementById('leagueTitle').textContent = `${half} — Rodada ${roundInHalf} concluída`;
  document.getElementById('leagueTableWrap').innerHTML = renderStandingsTable(st.teams);
  document.getElementById('leagueMatchesWrap').innerHTML = renderRoundResults(st.currentRoundResults, st.currentHumanResult);
  const isLast = st.roundIndex + 1 >= 14;
  document.getElementById('leagueContinueBtn').textContent = isLast ? 'Ver Resultado Final' : 'Próxima Rodada';
  document.getElementById('leagueContinueBtn').onclick = () => {
    st.roundIndex++;
    if (st.roundIndex >= 14) finalizeLeague();
    else startLeagueRound();
  };
  showScreen('screen-league');
}

function renderLeagueFinalTable(champion) {
  const st = leagueState;
  const gp = championPhrase(champion);
  document.getElementById('leagueStageBadge').textContent = 'Liga — Resultado Final';
  document.getElementById('leagueTitle').textContent = `${countryLabel(champion)} é ${gp.art} ${gp.campeao} da Liga!`;
  document.getElementById('leagueTableWrap').innerHTML = renderStandingsTable(st.teams) +
    `<div class="panel" style="text-align:center;">🏆 <strong>${countryLabel(champion)}</strong> é ${gp.art} ${gp.campeao} da Liga (Melhor de ${st.bo}) com ${champion.pts} pontos!</div>`;
  document.getElementById('leagueMatchesWrap').innerHTML = '';
  document.getElementById('leagueContinueBtn').textContent = 'Voltar ao Menu';
  document.getElementById('leagueContinueBtn').onclick = () => goToMenu();
  showScreen('screen-league');
}

function announceLeagueChampion(champion) {
  const st = leagueState;
  renderLeagueFinalTable(champion); // tabela final pronta atrás da plaqueta
  championReturnScreen = 'screen-league';
  const gp = championPhrase(champion);
  if (champion.isHuman) {
    history.titles.league[st.bo===5?'bo5':'bo3']++;
    updateHistoryDisplay();
    document.getElementById('championTitleEl').textContent = `🎉 ${gp.campeao.toUpperCase()} DA LIGA! 🎉`;
    document.getElementById('championSub').textContent =
      `Você venceu a Liga (Melhor de ${st.bo}) representando ${countryLabel(champion)} e é ${gp.art} ${gp.novo} ${gp.campeao} com ${champion.pts} pontos!`;
    showScreen('screen-champion'); buildConfetti();
    playFanfare(() => { setTimeout(() => { if (trackSetting !== 'off') playPopRockTrack(MENU_TRACK); }, 2000); });
  } else {
    document.getElementById('championTitleEl').textContent = `🏆 ${gp.campeao.toUpperCase()} DA LIGA: ${countryLabel(champion)}! 🏆`;
    document.getElementById('championSub').textContent =
      `${countryLabel(champion)} é ${gp.art} ${gp.campeao} da Liga (Melhor de ${st.bo}) com ${champion.pts} pontos!`;
    if (trackSetting !== 'off') playPopRockTrack(MENU_TRACK); else stopMusic(0.4);
    showScreen('screen-champion');
  }
}

function finalizeLeague() {
  const st = leagueState;
  const sorted = st.teams.slice().sort((a,b) => b.pts-a.pts || b.w-a.w);
  const champion = sorted[0];
  announceLeagueChampion(champion);
}

/* ============ PARTIDA (comum) ============ */
function beginMatch(bo, stageLabel) {
  matchPlayer = 0; matchIA = 0; matchHistoryMoves = [];
  roundsToWin = bo === 5 ? 3 : 2;
  if (difficulty === 'dificil') {
    matchDifficilSequence = Array.from({length:8}, () => randomChoiceRPS());
    difficilIndex = 0;
  }
  document.getElementById('matchStageBadge').textContent = stageLabel;
  document.getElementById('opponentNameEl').textContent = `${countryLabel(currentFlow.humanTeam)}  vs  ${countryLabel(currentFlow.opponentTeam)}`;
  renderDots();
  resetRoundUI();
  showScreen('screen-match');
  nextRound();
}

function renderDots() {
  const dy = document.getElementById('dotsYou'), di = document.getElementById('dotsIA');
  dy.innerHTML=''; di.innerHTML='';
  for (let i=0;i<roundsToWin;i++) {
    const d1=document.createElement('div'); d1.className='dot'+(i<matchPlayer?' filled-you':'');
    const d2=document.createElement('div'); d2.className='dot'+(i<matchIA?' filled-ia':'');
    dy.appendChild(d1); di.appendChild(d2);
  }
}
function resetRoundUI() {
  document.getElementById('youDisplay').textContent = '❔';
  document.getElementById('iaDisplay').textContent = '❔';
  document.getElementById('resultText').textContent = 'Escolha sua jogada!';
  document.getElementById('resultText').className = 'result-text';
  document.querySelectorAll('#screen-match .choice-btn').forEach(b => b.disabled = false);
}
function nextRound() { resetRoundUI(); roundLocked = false; startRoundTimer(); }

function startRoundTimer() {
  clearRoundTimer();
  const bar = document.getElementById('timerBar'), numEl = document.getElementById('timerNumber');
  let secondsLeft = 3;
  numEl.textContent = secondsLeft;
  bar.style.transition = 'none'; bar.style.width = '100%';
  void bar.offsetWidth;
  bar.style.transition = 'width 3s linear'; bar.style.width = '0%';
  roundTimerInterval = setInterval(() => { secondsLeft -= 1; if (secondsLeft >= 0) numEl.textContent = secondsLeft; }, 1000);
  roundTimerTimeout = setTimeout(() => { if (!roundLocked) resolveRound(null, true); }, 3000);
}
function clearRoundTimer() { clearTimeout(roundTimerTimeout); clearInterval(roundTimerInterval); }

document.querySelectorAll('#screen-match .choice-btn').forEach(btn => {
  btn.addEventListener('click', () => { if (!roundLocked) resolveRound(btn.dataset.choice, false); });
});

function resolveRound(playerChoiceArg, timedOut) {
  if (roundLocked) return;
  roundLocked = true;
  clearRoundTimer();
  document.querySelectorAll('#screen-match .choice-btn').forEach(b => b.disabled = true);

  let playerChoice, iaChoice;
  if (timedOut) { playerChoice = randomChoiceRPS(); iaChoice = randomChoiceRPS(); }
  else { playerChoice = playerChoiceArg; iaChoice = getIAChoice(); }
  matchHistoryMoves.push(playerChoice);
  if (matchHistoryMoves.length > 10) matchHistoryMoves.shift();

  const youDisplay = document.getElementById('youDisplay'), iaDisplay = document.getElementById('iaDisplay');
  youDisplay.textContent = emojis[playerChoice]; iaDisplay.textContent = emojis[iaChoice];
  youDisplay.style.transform='scale(1.15)'; iaDisplay.style.transform='scale(1.15)';
  setTimeout(() => { youDisplay.style.transform='scale(1)'; iaDisplay.style.transform='scale(1)'; }, 200);

  const resultText = document.getElementById('resultText');
  const prefix = timedOut ? '⏱ Tempo esgotado — jogadas aleatórias! ' : '';
  if (playerChoice === iaChoice) {
    resultText.textContent = prefix + '🤝 Empate!'; resultText.className = 'result-text draw';
  } else if (beats[playerChoice] === iaChoice) {
    matchPlayer++;
    resultText.textContent = prefix + '🎉 Você venceu a rodada!'; resultText.className = 'result-text win';
  } else {
    matchIA++;
    resultText.textContent = prefix + '💀 A IA venceu a rodada!'; resultText.className = 'result-text lose';
  }
  renderDots();
  setTimeout(checkMatchEnd, 1700);
}

function checkMatchEnd() {
  if (matchPlayer >= roundsToWin || matchIA >= roundsToWin) handleMatchEnd(matchPlayer >= roundsToWin);
  else nextRound();
}

function buildConfetti() {
  const wrap = document.getElementById('confettiWrap');
  wrap.querySelectorAll('.confetti').forEach(c => c.remove());
  const bits = ['🎉','✨','🎊','⭐'];
  for (let i=0;i<10;i++) {
    const s = document.createElement('span');
    s.className='confetti'; s.textContent = bits[Math.floor(Math.random()*bits.length)];
    s.style.left = (Math.random()*100)+'%'; s.style.animationDelay = (Math.random()*2)+'s';
    wrap.appendChild(s);
  }
}

function handleMatchEnd(playerWonMatch) {
  if (playerWonMatch) history.wins++; else history.losses++;
  updateHistoryDisplay();

  if (currentFlow.type === 'quick') {
    document.getElementById('matchResultIcon').textContent = playerWonMatch ? '🏆' : '💀';
    document.getElementById('matchResultTitle').textContent = playerWonMatch
      ? `${countryLabel(currentFlow.humanTeam)} venceu a partida!` : `${countryLabel(currentFlow.humanTeam)} perdeu a partida`;
    document.getElementById('matchResultSub').textContent =
      `Placar final: ${countryLabel(currentFlow.humanTeam)} ${matchPlayer} — ${matchIA} ${countryLabel(currentFlow.opponentTeam)}`;
    document.getElementById('matchResultContinueBtn').textContent = 'Voltar ao Menu';
    document.getElementById('matchResultContinueBtn').onclick = () => goToMenu();
    showScreen('screen-match-result');
    return;
  }

  if (currentFlow.type === 'tournament') {
    const st = tournamentState;
    const stageKey = currentFlow.stageKey;
    const m = st.matches[stageKey];
    const wScore = Math.max(matchPlayer, matchIA), lScore = Math.min(matchPlayer, matchIA);
    const winner = playerWonMatch ? st.humanTeam : currentFlow.opponentTeam;
    const loser = playerWonMatch ? currentFlow.opponentTeam : st.humanTeam;
    m.result = { winner, loser, wScore, lScore };

    if (stageKey === 'qf1') {
      st.matches.sf1.a = winner; // só agora, com as quartas encerradas, a semifinal é definida
      simulateIntoMatch(st.matches.sf2, st.bo);
      if (!playerWonMatch) {
        simulateIntoMatch(st.matches.sf1, st.bo);
        st.matches.final.a = st.matches.sf1.result.winner;
        st.matches.final.b = st.matches.sf2.result.winner;
        simulateIntoMatch(st.matches.final, st.bo);
        finishTournamentAsEliminated(st, 'Quartas de Final', 'nas');
        return;
      }
      st.stage = 'sf1';
      showBracketScreen();
      return;
    }

    if (stageKey === 'sf1') {
      st.matches.final.b = st.matches.sf2.result.winner;
      if (!playerWonMatch) {
        st.matches.final.a = currentFlow.opponentTeam;
        simulateIntoMatch(st.matches.final, st.bo);
        finishTournamentAsEliminated(st, 'Semifinal', 'na');
        return;
      }
      st.matches.final.a = st.humanTeam;
      st.stage = 'final';
      showBracketScreen();
      return;
    }

    // stageKey === 'final'
    st.finished = true;
    st.championTeam = winner;
    announceTournamentChampion(st);
    return;
  }

  if (currentFlow.type === 'league') {
    const winnerScore = Math.max(matchPlayer, matchIA), loserScore = Math.min(matchPlayer, matchIA);
    const winnerTeam = playerWonMatch ? currentFlow.humanTeam : currentFlow.opponentTeam;
    const loserTeam = playerWonMatch ? currentFlow.opponentTeam : currentFlow.humanTeam;
    applyResult(winnerTeam, loserTeam, winnerScore, loserScore, leagueState.bo);
    leagueState.currentHumanResult = { winner:winnerTeam, loser:loserTeam, wScore:winnerScore, lScore:loserScore };
    showLeagueRoundSummary();
  }
}

document.getElementById('championMenuBtn').addEventListener('click', () => showScreen(championReturnScreen || 'screen-menu'));

updateHistoryDisplay();

/* ============ SERVICE WORKER (modo offline) ============ */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.warn('Falha ao registrar o Service Worker:', err);
    });
  });
}
