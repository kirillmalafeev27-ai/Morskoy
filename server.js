const express = require('express');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const aiApiKey = process.env.AITUNNEL_API_KEY || process.env.OPENAI_API_KEY || '';
const aiBaseUrl = process.env.AITUNNEL_API_KEY ? 'https://api.aitunnel.ru/v1' : undefined;
let client = null;

function getAiClient() {
  if (!aiApiKey) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: aiApiKey,
      ...(aiBaseUrl ? { baseURL: aiBaseUrl } : {}),
    });
  }
  return client;
}

const questionPool = {};
const pvpSessions = new Map();

const PVP_SLOT_IDS = ['wortstellung', 'slot2', 'slot3', 'slot4', 'slot5'];
const PVP_ROLE_BONUSES = {
  runner: {
    wortstellung: 'dash',
    slot2: 'move2',
    slot3: 'camouflage',
    slot4: 'trap',
    slot5: 'dash',
  },
  hunter: {
    wortstellung: 'pounce',
    slot2: 'move2',
    slot3: 'hunt_map',
    slot4: 'trail',
    slot5: 'pounce',
  },
};
const PVP_TREASURE_TARGET = 3;
const PVP_CAMOUFLAGE_TURNS = 5;
const PVP_TRAP_STUN_TURNS = 3;
const PVP_TRAP_RADIUS = 2;
const PVP_MAP_REVEAL_MS = 1500;
const PVP_TRAIL_REVEAL_MS = 8000;

function makeSessionId() {
  let id = '';
  do {
    id = crypto.randomBytes(3).toString('hex').toUpperCase();
  } while (pvpSessions.has(id));
  return id;
}

function makePlayerToken() {
  return crypto.randomBytes(18).toString('hex');
}

function createEmptySetup() {
  return {
    isCreepy: true,
    difficulty: 'medium',
    gameMode: 'chase',
    langLevel: null,
    lexicalTopic: null,
    slotAssignments: [null, null, null, null, null],
  };
}

function createSession(playerName, preferredRole) {
  const role = preferredRole === 'hunter' ? 'hunter' : 'runner';
  const token = makePlayerToken();
  const session = {
    id: makeSessionId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    phase: 'lobby',
    hostToken: token,
    players: {
      runner: null,
      hunter: null,
    },
    ready: {
      runner: false,
      hunter: false,
    },
    setup: createEmptySetup(),
    game: null,
    subscribers: new Map(),
  };

  session.players[role] = {
    token,
    name: playerName || (role === 'runner' ? 'Runner' : 'Hunter'),
    joinedAt: Date.now(),
  };

  pvpSessions.set(session.id, session);
  return { session, token, role };
}

function getPlayerRole(session, playerToken) {
  if (!playerToken) return null;
  if (session.players.runner?.token === playerToken) return 'runner';
  if (session.players.hunter?.token === playerToken) return 'hunter';
  return null;
}

function getAvailableRole(session, preferredRole) {
  if (preferredRole && !session.players[preferredRole]) return preferredRole;
  if (!session.players.runner) return 'runner';
  if (!session.players.hunter) return 'hunter';
  return null;
}

function canStartSession(session) {
  return Boolean(
    session.players.runner &&
    session.players.hunter &&
    session.setup.langLevel &&
    session.setup.lexicalTopic &&
    Array.isArray(session.setup.slotAssignments) &&
    session.setup.slotAssignments.length === PVP_SLOT_IDS.length &&
    session.setup.slotAssignments.every(Boolean)
  );
}

function areSlotAssignmentsEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function didSetupChange(prevSetup, nextSetup) {
  return (
    prevSetup.isCreepy !== nextSetup.isCreepy ||
    prevSetup.difficulty !== nextSetup.difficulty ||
    prevSetup.langLevel !== nextSetup.langLevel ||
    prevSetup.lexicalTopic !== nextSetup.lexicalTopic ||
    !areSlotAssignmentsEqual(prevSetup.slotAssignments, nextSetup.slotAssignments)
  );
}

function touchSession(session) {
  session.updatedAt = Date.now();
}

function getApproxZone(player, maze) {
  const size = 5;
  const half = Math.floor(size / 2);
  const maxMinX = Math.max(1, maze.width - size);
  const maxMinY = Math.max(1, maze.height - size);
  const minX = Math.max(1, Math.min(player.x - half, maxMinX));
  const minY = Math.max(1, Math.min(player.y - half, maxMinY));
  const maxX = Math.min(maze.width - 2, minX + size - 1);
  const maxY = Math.min(maze.height - 2, minY + size - 1);
  return { minX, minY, maxX, maxY };
}

function canWalk(maze, x, y) {
  return (
    x >= 0 &&
    x < maze.width &&
    y >= 0 &&
    y < maze.height &&
    Array.isArray(maze.grid[y]) &&
    maze.grid[y][x] === 1
  );
}

function getWalkableCells(maze) {
  const cells = [];
  for (let y = 0; y < maze.height; y++) {
    for (let x = 0; x < maze.width; x++) {
      if (canWalk(maze, x, y)) cells.push({ x, y });
    }
  }
  return cells;
}

function shuffleCells(cells) {
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells;
}

function createRoundTreasures(maze, players, count = PVP_TREASURE_TARGET) {
  const runner = players.runner;
  const hunter = players.hunter;
  const candidates = getWalkableCells(maze).filter(cell => {
    const fromRunner = Math.abs(cell.x - runner.x) + Math.abs(cell.y - runner.y);
    const fromHunter = Math.abs(cell.x - hunter.x) + Math.abs(cell.y - hunter.y);
    return fromRunner >= 6 && fromHunter >= 4;
  });
  const pool = candidates.length >= count
    ? candidates
    : getWalkableCells(maze).filter(cell =>
        !(cell.x === runner.x && cell.y === runner.y) &&
        !(cell.x === hunter.x && cell.y === hunter.y)
      );

  return shuffleCells(pool).slice(0, count).map(cell => ({
    x: cell.x,
    y: cell.y,
    collected: false,
  }));
}

function pushRunnerTrail(game) {
  game.runnerTrail.push({ x: game.players.runner.x, y: game.players.runner.y });
}

function isInTrapZone(trap, x, y) {
  const radius = trap.radius ?? PVP_TRAP_RADIUS;
  return Math.max(Math.abs(trap.x - x), Math.abs(trap.y - y)) <= radius;
}

function collectTreasureAt(game, x, y) {
  const treasure = game.treasures.find(item => !item.collected && item.x === x && item.y === y);
  if (!treasure) return false;

  treasure.collected = true;
  game.treasuresCollected = game.treasures.filter(item => item.collected).length;
  game.chaseProgress = game.treasuresCollected;
  if (game.treasuresCollected >= game.totalTreasures) {
    return true;
  }
  return false;
}

function finishGame(session, winner) {
  if (!session.game || session.game.status === 'finished') return;
  session.game.status = 'finished';
  session.game.winner = winner;
  session.phase = 'finished';
}

function applyPvpBonus(session, role, bonusType) {
  const game = session.game;
  const actor = game.players[role];

  switch (bonusType) {
    case 'move2':
      actor.movesLeft = Math.max(actor.movesLeft, 2);
      actor.specialMove = null;
      break;
    case 'camouflage':
      game.effects.runnerCamouflageTurns = PVP_CAMOUFLAGE_TURNS;
      break;
    case 'trap':
      game.traps = game.traps.filter(trap => !(trap.x === actor.x && trap.y === actor.y));
      game.traps.push({
        x: actor.x,
        y: actor.y,
        stunTurns: PVP_TRAP_STUN_TURNS,
        radius: PVP_TRAP_RADIUS,
      });
      break;
    case 'dash':
    case 'pounce':
      actor.movesLeft = 0;
      actor.specialMove = {
        type: bonusType,
        distance: 3,
      };
      break;
    case 'hunt_map':
      game.effects.huntMapUntil = Date.now() + PVP_MAP_REVEAL_MS;
      game.effects.huntZone = getApproxZone(game.players.runner, game.maze);
      break;
    case 'trail':
      game.effects.trailRevealUntil = Date.now() + PVP_TRAIL_REVEAL_MS;
      break;
  }
}

function stepPlayer(session, role, direction) {
  const game = session.game;
  const actor = game.players[role];
  const opponent = game.players[role === 'runner' ? 'hunter' : 'runner'];
  const dirs = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };
  const dir = dirs[direction];
  if (!dir) return { moved: 0 };

  const steps = actor.specialMove ? actor.specialMove.distance : 1;
  let moved = 0;
  let trapTriggered = false;
  let treasureCollected = false;

  for (let i = 0; i < steps; i++) {
    const nextX = actor.x + dir.x;
    const nextY = actor.y + dir.y;
    if (!canWalk(game.maze, nextX, nextY)) break;

    actor.x = nextX;
    actor.y = nextY;
    moved++;

    if (role === 'runner' && actor.x === opponent.x && actor.y === opponent.y) {
      finishGame(session, 'hunter');
      break;
    }

    if (role === 'runner') {
      pushRunnerTrail(game);
      if (collectTreasureAt(game, actor.x, actor.y)) {
        treasureCollected = true;
        finishGame(session, 'runner');
      }
      if (game.effects.runnerCamouflageTurns > 0) {
        game.effects.runnerCamouflageTurns--;
      }
    } else {
      const trapIdx = game.traps.findIndex(trap => isInTrapZone(trap, actor.x, actor.y));
      if (trapIdx >= 0) {
        const trap = game.traps[trapIdx];
        actor.stunTurns = Math.max(actor.stunTurns, trap.stunTurns);
        actor.movesLeft = 0;
        actor.specialMove = null;
        trapTriggered = true;
      }
    }

    if (role === 'hunter' && actor.x === opponent.x && actor.y === opponent.y) {
      finishGame(session, 'hunter');
      break;
    }

    if (trapTriggered || session.game.status === 'finished') break;
  }

  if (actor.specialMove) {
    actor.specialMove = null;
  } else if (moved > 0 && actor.movesLeft > 0) {
    actor.movesLeft--;
  }

  return { moved, trapTriggered, treasureCollected };
}

function serializeGame(game, viewerRole) {
  if (!game) return null;
  return {
    status: game.status,
    winner: game.winner,
    maze: game.maze,
    players: game.players,
    traps: viewerRole === 'runner' ? game.traps : [],
    runnerTrail: game.runnerTrail,
    chaseProgress: game.chaseProgress,
    escapeTarget: game.escapeTarget,
    treasures: game.treasures,
    treasuresCollected: game.treasuresCollected,
    totalTreasures: game.totalTreasures,
    effects: game.effects,
  };
}

function hasActiveSubscriber(session, role) {
  const player = session.players[role];
  if (!player) return false;
  const subs = session.subscribers.get(player.token);
  return Boolean(subs && subs.size > 0);
}

function serializeSession(session, viewerToken) {
  const viewerRole = getPlayerRole(session, viewerToken);
  return {
    id: session.id,
    phase: session.phase,
    viewerRole,
    hostRole: getPlayerRole(session, session.hostToken),
    canStart: canStartSession(session),
    ready: session.ready,
    players: {
      runner: session.players.runner
        ? {
            name: session.players.runner.name,
            role: 'runner',
            connected: hasActiveSubscriber(session, 'runner'),
          }
        : null,
      hunter: session.players.hunter
        ? {
            name: session.players.hunter.name,
            role: 'hunter',
            connected: hasActiveSubscriber(session, 'hunter'),
          }
        : null,
    },
    setup: session.setup,
    game: serializeGame(session.game, viewerRole),
    serverNow: Date.now(),
  };
}

function sendSessionState(session, playerToken, res) {
  res.write(`data: ${JSON.stringify(serializeSession(session, playerToken))}\n\n`);
}

function broadcastSession(session) {
  for (const [playerToken, resSet] of session.subscribers.entries()) {
    for (const res of resSet) {
      sendSessionState(session, playerToken, res);
    }
  }
}

function getSessionOrRespond(sessionId, res) {
  const session = pvpSessions.get(sessionId);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return null;
  }
  return session;
}

function getPlayerOrRespond(session, playerToken, res) {
  const role = getPlayerRole(session, playerToken);
  if (!role) {
    res.status(403).json({ error: 'Player is not part of this session' });
    return null;
  }
  return role;
}

const TOPIC_RULES = {
  'Infinitiv mit zu': `Verwende NUR Verben, die "zu + Infinitiv" verlangen: versuchen, beginnen, anfangen, aufhören, vorhaben, hoffen, vergessen, planen, sich freuen, Lust haben, Es ist wichtig/möglich/schwer...
NIEMALS Modalverben (können, müssen, sollen, wollen, dürfen, mögen) — diese stehen mit Infinitiv OHNE "zu"!
Richtig: "Er versucht, den Bahnhof zu finden." | Falsch: "Er kann den Bahnhof zu finden."`,

  'Modalverben': `Modalverben: können, müssen, sollen, wollen, dürfen, mögen/möchten.
Modalverb auf Position 2, Infinitiv am Satzende OHNE "zu"!
Richtig: "Er kann den Bahnhof finden." | Falsch: "Er kann den Bahnhof zu finden."`,

  'Perfekt': `sein + Partizip II bei: Bewegungsverben (gehen→ist gegangen, fahren→ist gefahren, kommen→ist gekommen, fliegen→ist geflogen, laufen→ist gelaufen), Zustandsänderung (einschlafen→ist eingeschlafen, aufwachen, sterben, werden, bleiben).
haben + Partizip II bei ALLEN anderen Verben (machen→hat gemacht, essen→hat gegessen, lesen→hat gelesen).
Partizip II: ge-...-t (regelmäßig: gemacht, gekauft), ge-...-en (unregelmäßig: gegangen, geschrieben). Verben auf -ieren: KEIN ge- (studiert, telefoniert). Trennbare: ge- zwischen Präfix und Stamm (ein·ge·kauft, auf·ge·standen). Untrennbare (be-, er-, ver-, ent-, zer-, emp-, miss-): KEIN ge- (besucht, verstanden, erzählt).`,

  'Präteritum': `Regelmäßig: Stamm + -te/-test/-te/-ten/-tet/-ten (machte, sagtest).
Unregelmäßig: Stammvokalwechsel OHNE -te (gehen→ging, sehen→sah, nehmen→nahm, schreiben→schrieb, lesen→las, sprechen→sprach).
Mischverben: Vokalwechsel + -te (bringen→brachte, denken→dachte, kennen→kannte, wissen→wusste).`,

  'Dativ': `Dativpräpositionen: mit, nach, bei, seit, von, zu, aus, gegenüber, ab.
Dativverben: helfen, danken, gehören, gefallen, schmecken, passen, gratulieren, antworten, folgen.
Formen: dem (m/n), der (f), den + -n (Pl). ein→einem (m/n), eine→einer (f).`,

  'Akkusativ': `Akkusativpräpositionen: durch, für, gegen, ohne, um.
Formen: den (m), die (f), das (n), die (Pl). ein→einen (m), eine (f), ein (n).
Transitive Verben: sehen, kaufen, essen, trinken, lesen, schreiben, brauchen, haben, finden.`,

  'Genitiv': `Genitivpräpositionen: wegen, trotz, während, innerhalb, außerhalb, statt/anstatt.
Maskulin/Neutrum: des/eines + Nomen mit -(e)s (des Mannes, eines Kindes).
Feminin: der/einer + Nomen OHNE Endung (der Frau, einer Studentin).
Plural: der + Nomen OHNE Endung (der Kinder).`,

  'Adjektivdeklination': `Nach bestimmtem Artikel (der/die/das): -e (Nom. Sg. alle Genera), -en (alle anderen Fälle).
Nach unbestimmtem Artikel (ein/kein/mein): -er (Nom.m), -es (Nom./Akk.n), -e (Nom./Akk.f), -en (alle anderen).
Ohne Artikel: starke Endungen — Signalendungen des bestimmten Artikels: -er (m.Nom), -e (f.Nom/Akk), -es (n.Nom/Akk), -en (Dat/Gen), -em (m/n.Dat).
Richtig: "ein alter Mann" (m.Nom), "mit dem alten Mann" (m.Dat) | Falsch: "ein alten Mann", "mit dem alter Mann"`,

  'Wechselpräpositionen': `an, auf, hinter, in, neben, über, unter, vor, zwischen.
Wohin? (Bewegung/Richtung) → Akkusativ: "Ich stelle das Buch auf den Tisch." (stellen, legen, setzen, hängen)
Wo? (Position/Ort) → Dativ: "Das Buch steht auf dem Tisch." (stehen, liegen, sitzen, hängen)`,

  'Negation': `"nicht" verneint: Verben, Adjektive, Adverbien, Präpositionalphrasen. Position: vor dem verneinten Element.
"kein/keine/keinen/keinem/keiner" ersetzt unbestimmten Artikel oder Nullartikel + Nomen.
Richtig: "Ich habe kein Auto." | Falsch: "Ich habe nicht Auto."
Richtig: "Ich komme nicht aus Berlin." | Falsch: "Ich komme kein aus Berlin."`,

  'Wortstellung im Hauptsatz': `Finites Verb IMMER auf Position 2!
Inversion bei Adverb/Objekt auf Pos.1: Verb Pos.2, Subjekt Pos.3.
Richtig: "Gestern ging ich ins Kino." | Falsch: "Gestern ich ging ins Kino."`,

  'Wortstellung im Nebensatz': `Nach Konjunktion (weil, dass, wenn, ob, als, nachdem, obwohl): finites Verb am SATZENDE.
Richtig: "Ich weiß, dass er morgen kommt." | Falsch: "Ich weiß, dass er kommt morgen."
Perfekt im Nebensatz: "..., weil er nach Hause gegangen ist." (Hilfsverb am Ende!)`,

  'dass-Sätze': `"dass" + Nebensatzwortstellung (Verb am Ende).
Richtig: "Ich glaube, dass er recht hat." | Falsch: "Ich glaube, dass er hat recht."`,

  'weil-Sätze': `"weil" + Nebensatzwortstellung (Verb am Ende).
Richtig: "Ich bleibe zu Hause, weil ich krank bin." | Falsch: "Ich bleibe zu Hause, weil ich bin krank."`,

  'wenn-Sätze': `"wenn" + Verb am Ende. Hauptsatz nach wenn-Satz: Verb auf Position 1.
Richtig: "Wenn es regnet, bleibe ich zu Hause." | Falsch: "Wenn es regnet, ich bleibe zu Hause."`,

  'Relativsätze': `Relativpronomen: Genus/Numerus vom BEZUGSWORT, aber Kasus von der FUNKTION im Nebensatz!
Bestimme den Kasus: Was ist die Rolle des Relativpronomens im Nebensatz? Subjekt→Nom, direktes Objekt→Akk, indirektes Objekt→Dat.
Nom: der/die/das/die. Akk: den/die/das/die. Dat: dem/der/dem/denen. Gen: dessen/deren.
Richtig: "Der Turm, den man sehen kann" (Akk! weil: man sieht DEN Turm). Falsch: "Der Turm, dem man sehen kann."
Richtig: "Der Mann, dem ich helfe" (Dat! weil: ich helfe DEM Mann). Verb am Ende des Relativsatzes!`,

  'Konjunktiv II': `Irreale Wünsche, höfliche Bitten, Ratschläge.
würde + Infinitiv (Standard). Eigene Formen: wäre, hätte, könnte, müsste, sollte, dürfte, wüsste, käme, ginge, bräuchte.
Richtig: "Wenn ich reich wäre, würde ich reisen." | Falsch: "Wenn ich reich würde sein..."`,

  'Passiv': `Vorgangspassiv: werden + Partizip II. "Das Buch wird gelesen."
Zustandspassiv: sein + Partizip II. "Das Fenster ist geöffnet."
Agens: von + Dativ. Präteritum: wurde + P.II. Perfekt: ist + P.II + worden.`,

  'Präsens': `Konjugation: -e, -st, -t, -en, -t, -en.
Stammvokalwechsel (2./3. Sg.): e→i (sprechen→spricht, helfen→hilft), e→ie (lesen→liest, sehen→sieht), a→ä (fahren→fährt, schlafen→schläft).
Verben auf -ten/-den: Bindevokal -e- (du arbeitest, er arbeitet).`,

  'Futur I': `werden + Infinitiv. werden: werde, wirst, wird, werden, werdet, werden.
Richtig: "Ich werde morgen kommen." | Falsch: "Ich werde morgen zu kommen."`,

  'Imperativ': `du: Stamm (+e optional): "Komm!", "Mach!". e→i/ie bleibt: "Sprich!", "Lies!", "Nimm!" (KEIN -st, KEIN Pronomen). a→ä fällt weg: "Fahr!" (nicht "Fähr!").
ihr: wie Präsens ohne "ihr": "Kommt!", "Lest!".
Sie: Infinitiv + Sie: "Kommen Sie!", "Lesen Sie!"`,

  'Artikel': `Bestimmt: der (m), die (f), das (n), die (Pl). Unbestimmt: ein (m/n), eine (f).
Genus-Regeln: -ung/-heit/-keit/-schaft/-tion/-tät → die. -chen/-lein → das. -er/-ling → oft der.`,

  'Nominativ': `Subjekt im Nominativ. Prädikativ nach sein/werden/bleiben ebenfalls Nominativ.
Richtig: "Der Mann ist ein guter Lehrer." | Falsch: "Der Mann ist einen guten Lehrer."`,
};

app.post('/api/pvp/sessions', (req, res) => {
  const { playerName, preferredRole } = req.body || {};
  const { session, token, role } = createSession(playerName, preferredRole);
  res.json({
    sessionId: session.id,
    playerToken: token,
    role,
    session: serializeSession(session, token),
  });
});

app.post('/api/pvp/sessions/:sessionId/join', (req, res) => {
  const session = getSessionOrRespond(req.params.sessionId, res);
  if (!session) return;

  const { playerName, preferredRole } = req.body || {};
  const role = getAvailableRole(session, preferredRole);
  if (!role) {
    res.status(409).json({ error: 'Session is full' });
    return;
  }

  const token = makePlayerToken();
  session.players[role] = {
    token,
    name: playerName || (role === 'runner' ? 'Runner' : 'Hunter'),
    joinedAt: Date.now(),
  };
  session.ready[role] = false;
  touchSession(session);
  broadcastSession(session);

  res.json({
    sessionId: session.id,
    playerToken: token,
    role,
    session: serializeSession(session, token),
  });
});

app.get('/api/pvp/sessions/:sessionId', (req, res) => {
  const session = getSessionOrRespond(req.params.sessionId, res);
  if (!session) return;

  const playerToken = req.query.token;
  const role = getPlayerOrRespond(session, playerToken, res);
  if (!role) return;

  res.json({ session: serializeSession(session, playerToken) });
});

app.get('/api/pvp/sessions/:sessionId/stream', (req, res) => {
  const session = getSessionOrRespond(req.params.sessionId, res);
  if (!session) return;

  const playerToken = req.query.token;
  const role = getPlayerOrRespond(session, playerToken, res);
  if (!role) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!session.subscribers.has(playerToken)) {
    session.subscribers.set(playerToken, new Set());
  }
  session.subscribers.get(playerToken).add(res);

  sendSessionState(session, playerToken, res);
  broadcastSession(session);

  req.on('close', () => {
    const subs = session.subscribers.get(playerToken);
    if (subs) {
      subs.delete(res);
      if (subs.size === 0) {
        session.subscribers.delete(playerToken);
      }
    }
    broadcastSession(session);
  });
});

app.post('/api/pvp/sessions/:sessionId/setup', (req, res) => {
  const session = getSessionOrRespond(req.params.sessionId, res);
  if (!session) return;

  const { playerToken, patch } = req.body || {};
  const role = getPlayerOrRespond(session, playerToken, res);
  if (!role) return;
  if (session.phase !== 'lobby') {
    res.status(409).json({ error: 'Setup can only be changed in the lobby' });
    return;
  }

  const safePatch = patch || {};
  const nextSetup = { ...session.setup };

  if (typeof safePatch.isCreepy === 'boolean') nextSetup.isCreepy = safePatch.isCreepy;
  if (typeof safePatch.difficulty === 'string') nextSetup.difficulty = safePatch.difficulty;
  if (typeof safePatch.langLevel === 'string') nextSetup.langLevel = safePatch.langLevel;
  if (typeof safePatch.lexicalTopic === 'string') nextSetup.lexicalTopic = safePatch.lexicalTopic;
  if (Array.isArray(safePatch.slotAssignments) && safePatch.slotAssignments.length === PVP_SLOT_IDS.length) {
    nextSetup.slotAssignments = safePatch.slotAssignments.map(topic => (typeof topic === 'string' ? topic : null));
  }

  const setupChanged = didSetupChange(session.setup, nextSetup);
  if (!setupChanged) {
    res.json({ session: serializeSession(session, playerToken) });
    return;
  }

  session.setup = nextSetup;
  session.ready.runner = false;
  session.ready.hunter = false;
  touchSession(session);
  broadcastSession(session);

  res.json({ session: serializeSession(session, playerToken) });
});

app.post('/api/pvp/sessions/:sessionId/ready', (req, res) => {
  const session = getSessionOrRespond(req.params.sessionId, res);
  if (!session) return;

  const { playerToken, ready } = req.body || {};
  const role = getPlayerOrRespond(session, playerToken, res);
  if (!role) return;
  if (!canStartSession(session)) {
    res.status(409).json({ error: 'Session setup is incomplete' });
    return;
  }
  if (session.phase === 'in_game') {
    res.status(409).json({ error: 'Game is already running' });
    return;
  }

  session.ready[role] = Boolean(ready);
  session.phase = session.ready.runner && session.ready.hunter ? 'awaiting_init' : 'lobby';
  touchSession(session);
  broadcastSession(session);

  res.json({ session: serializeSession(session, playerToken) });
});

app.post('/api/pvp/sessions/:sessionId/leave', (req, res) => {
  const session = getSessionOrRespond(req.params.sessionId, res);
  if (!session) return;

  const { playerToken } = req.body || {};
  const role = getPlayerOrRespond(session, playerToken, res);
  if (!role) return;

  session.players[role] = null;
  session.ready[role] = false;
  session.subscribers.delete(playerToken);

  if (session.hostToken === playerToken) {
    session.hostToken = session.players.runner?.token || session.players.hunter?.token || null;
  }

  if (!session.players.runner && !session.players.hunter) {
    pvpSessions.delete(session.id);
    res.json({ ok: true });
    return;
  }

  session.phase = 'lobby';
  session.game = null;
  touchSession(session);
  broadcastSession(session);

  res.json({ ok: true });
});

app.post('/api/pvp/sessions/:sessionId/game/init', (req, res) => {
  const session = getSessionOrRespond(req.params.sessionId, res);
  if (!session) return;

  const { playerToken, payload } = req.body || {};
  const role = getPlayerOrRespond(session, playerToken, res);
  if (!role) return;
  if (playerToken !== session.hostToken) {
    res.status(403).json({ error: 'Only the session host can initialize the match' });
    return;
  }
  if (!(session.ready.runner && session.ready.hunter)) {
    res.status(409).json({ error: 'Both players must be ready first' });
    return;
  }

  const maze = payload?.maze;
  const players = payload?.players;
  if (
    !maze ||
    !Array.isArray(maze.grid) ||
    typeof maze.width !== 'number' ||
    typeof maze.height !== 'number' ||
    !players?.runner ||
    !players?.hunter
  ) {
    res.status(400).json({ error: 'Invalid initial game payload' });
    return;
  }

  const treasures = Array.isArray(payload?.treasures) && payload.treasures.length > 0
    ? payload.treasures.slice(0, PVP_TREASURE_TARGET).map(treasure => ({
        x: treasure.x,
        y: treasure.y,
        collected: false,
      }))
    : createRoundTreasures(maze, players, PVP_TREASURE_TARGET);

  session.game = {
    status: 'running',
    winner: null,
    maze,
    players: {
      runner: {
        x: players.runner.x,
        y: players.runner.y,
        movesLeft: 0,
        stunTurns: 0,
        specialMove: null,
      },
      hunter: {
        x: players.hunter.x,
        y: players.hunter.y,
        movesLeft: 0,
        stunTurns: 0,
        specialMove: null,
      },
    },
    traps: [],
    runnerTrail: [{ x: players.runner.x, y: players.runner.y }],
    treasures,
    treasuresCollected: 0,
    totalTreasures: PVP_TREASURE_TARGET,
    chaseProgress: 0,
    escapeTarget: PVP_TREASURE_TARGET,
    effects: {
      runnerCamouflageTurns: 0,
      huntMapUntil: 0,
      huntZone: null,
      trailRevealUntil: 0,
    },
  };

  session.phase = 'in_game';
  touchSession(session);
  broadcastSession(session);

  res.json({ session: serializeSession(session, playerToken) });
});

app.post('/api/pvp/sessions/:sessionId/game/answer', (req, res) => {
  const session = getSessionOrRespond(req.params.sessionId, res);
  if (!session) return;

  const { playerToken, slotId, correct } = req.body || {};
  const role = getPlayerOrRespond(session, playerToken, res);
  if (!role) return;
  if (!session.game || session.phase !== 'in_game') {
    res.status(409).json({ error: 'Game is not running' });
    return;
  }

  const actor = session.game.players[role];
  if (!correct) {
    res.json({
      result: 'wrong',
      session: serializeSession(session, playerToken),
    });
    return;
  }

  if (actor.stunTurns > 0) {
    actor.stunTurns--;
    touchSession(session);
    broadcastSession(session);
    res.json({
      result: 'stunned',
      remainingStunTurns: actor.stunTurns,
      session: serializeSession(session, playerToken),
    });
    return;
  }

  const bonusType = PVP_ROLE_BONUSES[role][slotId];
  if (!bonusType) {
    res.status(400).json({ error: 'Unknown slot bonus' });
    return;
  }

  if (session.game.status !== 'finished') {
    applyPvpBonus(session, role, bonusType);
  }

  touchSession(session);
  broadcastSession(session);

  res.json({
    result: 'correct',
    bonusType,
    session: serializeSession(session, playerToken),
  });
});

app.post('/api/pvp/sessions/:sessionId/game/move', (req, res) => {
  const session = getSessionOrRespond(req.params.sessionId, res);
  if (!session) return;

  const { playerToken, direction } = req.body || {};
  const role = getPlayerOrRespond(session, playerToken, res);
  if (!role) return;
  if (!session.game || session.phase !== 'in_game') {
    res.status(409).json({ error: 'Game is not running' });
    return;
  }

  const actor = session.game.players[role];
  if (!actor.specialMove && actor.movesLeft <= 0) {
    res.status(409).json({ error: 'No moves available' });
    return;
  }

  const result = stepPlayer(session, role, direction);
  touchSession(session);
  broadcastSession(session);

  res.json({
    result,
    session: serializeSession(session, playerToken),
  });
});

app.post('/api/pvp/sessions/:sessionId/game/restart', (req, res) => {
  const session = getSessionOrRespond(req.params.sessionId, res);
  if (!session) return;

  const { playerToken } = req.body || {};
  const role = getPlayerOrRespond(session, playerToken, res);
  if (!role) return;
  if (!session.game || session.game.status !== 'finished') {
    res.status(409).json({ error: 'Round is not finished' });
    return;
  }

  session.game = null;
  session.phase = 'lobby';
  session.ready.runner = false;
  session.ready.hunter = false;
  touchSession(session);
  broadcastSession(session);

  res.json({ session: serializeSession(session, playerToken) });
});

app.post('/api/generate-questions', async (req, res) => {
  const { level, lexicalTopic, grammarTopic, isWortstellung, count, exclude } = req.body;

  if (!level || !grammarTopic) {
    return res.status(400).json({ error: 'level and grammarTopic are required' });
  }

  const aiClient = getAiClient();
  if (!aiClient) {
    return res.status(503).json({ error: 'Question generation is not configured on the server' });
  }

  const questionsCount = count || 10;
  const cacheKey = `${level}:${grammarTopic}:${lexicalTopic || ''}:${isWortstellung ? 'w' : 'g'}`;

  if (questionPool[cacheKey] && questionPool[cacheKey].length >= questionsCount) {
    const cached = questionPool[cacheKey].splice(0, questionsCount);
    res.json({ questions: cached });
    return;
  }

  let excludeNote = '';
  if (exclude && exclude.length > 0) {
    const short = exclude.slice(-10).map(t => `"${t}"`).join(', ');
    excludeNote = `\nVerwende diese Sätze NICHT: ${short}`;
  }

  const topicRule = TOPIC_RULES[grammarTopic] || '';

  let taskDescription;
  if (isWortstellung) {
    taskDescription = `Erstelle ${questionsCount} Wortstellungsübungen für Deutsch (Niveau ${level}).
Grammatikthema: ${grammarTopic}.
${lexicalTopic ? `Lexikalisches Thema: ${lexicalTopic}. Alle Sätze müssen Wörter aus diesem Thema verwenden.` : ''}

Format:
- "display": Wörter/Phrasen durch " / " getrennt in ZUFÄLLIGER Reihenfolge (NICHT in der korrekten Reihenfolge!)
- "options": 4 vollständige deutsche Sätze — NUR EINER ist grammatisch korrekt
- "correct": Index der korrekten Option (0–3), GLEICHMÄSSIG verteilt
- "text": Kurze Anweisung auf Russisch (z.B. "Расставь слова в правильном порядке:")

Regeln für Wortstellungsübungen:
- Die Wörter in "display" MÜSSEN durcheinander sein — NICHT in der korrekten Reihenfolge!
- NUR EIN Satz darf korrekt sein. Inversionen (z.B. "Morgen gehe ich" statt "Ich gehe morgen") sind AUCH korrekt — biete sie NICHT als falsche Option an!
- Falsche Optionen: klare Wortstellungsfehler (Verb nicht auf Position 2 im Hauptsatz, Verb nicht am Ende im Nebensatz usw.)
- Jeder Satz ANDERS (verschiedene Subjekte, Verben, Situationen)`;
  } else {
    taskDescription = `Erstelle ${questionsCount} Grammatikübungen (Lückenübungen) für Deutsch (Niveau ${level}).
Grammatikthema: ${grammarTopic}.
${lexicalTopic ? `Lexikalisches Thema: ${lexicalTopic}. Alle Sätze müssen Wörter aus diesem Thema verwenden.` : ''}

Format:
- "display": Deutscher Satz mit Lücke ___ an der relevanten Stelle
- "options": 4 Optionen auf Deutsch — NUR EINE ist grammatisch korrekt
- "correct": Index der korrekten Option (0–3), GLEICHMÄSSIG verteilt
- "text": Kurze Anweisung auf Russisch (z.B. "Выбери правильный вариант:")

Regeln für Lückenübungen:
- Falsche Optionen: EINE klare Fehlerart (falscher Kasus, falscher Artikel, falsche Endung, falsche Konjugation)
- Keine absurden oder offensichtlich falschen Optionen — sie müssen plausibel aussehen
- Jeder Satz ANDERS (verschiedene Subjekte, Verben, Situationen)`;
  }

  const prompt = `Du bist ein erfahrener DaF-Lehrer (Deutsch als Fremdsprache) und Lehrbuchautor. Du erstellst Übungen auf dem Qualitätsniveau von Schritte International, Menschen und Aspekte.

${topicRule ? `GRAMMATIKREGELN für "${grammarTopic}" — halte dich STRIKT daran:\n${topicRule}\n` : ''}
${taskDescription}
${excludeNote}

QUALITÄTSKONTROLLE — prüfe JEDE Übung BEVOR du sie ausgibst:
1. Setze die korrekte Option in den Satz ein → ist er grammatisch PERFEKT? Kasus, Genus, Numerus, Konjugation, Wortstellung — alles korrekt?
2. Setze JEDE falsche Option ein → enthält der Satz einen KLAREN grammatischen Fehler?
3. Gibt es GENAU EINE korrekte Antwort? Wenn zwei Optionen korrekt sein könnten → Übung neu formulieren!
4. Passt die Übung zum Thema "${grammarTopic}" und zum Niveau ${level}?
5. Sind die Sätze natürlich und vollständig?

Antworte NUR mit einem validen JSON-Array, KEIN Markdown, KEINE Erklärungen:
[{"text":"Инструкция на русском","display":"Deutscher Text","options":["A","B","C","D"],"correct":0}]`;

  try {
    const completion = await aiClient.chat.completions.create({
      model: 'gpt-5.4',
      max_completion_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = completion.choices[0].message.content.trim();
    let jsonStr = text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) jsonStr = jsonMatch[0];

    const questions = JSON.parse(jsonStr);
    const valid = questions.filter(q =>
      q.text && q.display && Array.isArray(q.options) &&
      q.options.length === 4 && typeof q.correct === 'number' &&
      q.correct >= 0 && q.correct <= 3
    );

    if (valid.length > questionsCount) {
      if (!questionPool[cacheKey]) questionPool[cacheKey] = [];
      questionPool[cacheKey].push(...valid.slice(questionsCount));
    }

    res.json({ questions: valid.slice(0, questionsCount) });
  } catch (err) {
    console.error('AI Tunnel API error:', err.message);
    res.status(500).json({ error: 'Failed to generate questions', detail: err.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Morskoy Dungeon running on port ${PORT}`);
});
