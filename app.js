/* ============================================
   MARCH MADNESS H2H BRACKET TRACKER
   Shared via Firebase Realtime Database
   ============================================ */

// ---- Constants ----
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const TOURNAMENT_GROUP = 100;
const PLAYER_COLORS = ['#ff6b35','#448aff','#00c853','#ff3d57','#ffc107','#b388ff','#00bcd4','#ff80ab'];
const NUM_PLAYERS = 8;

const ROUND_NAMES = {
    64: 'Round of 64',
    32: 'Round of 32',
    16: 'Sweet 16',
    8: 'Elite 8',
    4: 'Final Four',
    2: 'Championship'
};

const ROUND_DATES = {
    64: ['20260319', '20260320'],
    32: ['20260321', '20260322'],
    16: ['20260326', '20260327'],
    8:  ['20260328', '20260329'],
    4:  ['20260405'],
    2:  ['20260407']
};

// ---- State ----
let state = {
    players: Array.from({length: NUM_PLAYERS}, (_, i) => ({ id: i, name: `Player ${i + 1}`, color: PLAYER_COLORS[i] })),
    teamControl: {},
    originalDraft: {},
    transfers: [],
    overrides: {},
    closingLines: {},
    games: {},
    currentRound: 64,
    teams: {}
};

// ---- Firebase Integration ----
let db = null;
let firebaseReady = false;
let firebaseInitialSyncDone = false;

function initFirebase() {
    if (typeof firebase === 'undefined' || typeof firebaseConfig === 'undefined' || !firebaseConfig || firebaseConfig.apiKey === 'YOUR_API_KEY') {
        console.warn('Firebase not configured — running in local-only mode');
        loadStateLocal();
        // If no local state either, seed with defaults
        if (Object.keys(state.originalDraft).length === 0 && typeof DEFAULT_PLAYERS !== 'undefined' && typeof DEFAULT_DRAFT !== 'undefined') {
            state.players = JSON.parse(JSON.stringify(DEFAULT_PLAYERS));
            state.originalDraft = { ...DEFAULT_DRAFT };
            state.teamControl = { ...DEFAULT_DRAFT };
            saveStateLocal();
        }
        return false;
    }

    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.database();
        firebaseReady = true;
        console.log('Firebase connected');

        // Listen for real-time updates
        db.ref('league').on('value', (snapshot) => {
            const data = snapshot.val();
            if (data && data.originalDraft && Object.keys(data.originalDraft).length > 0) {
                state.players = data.players || state.players;
                state.teamControl = data.teamControl || {};
                state.originalDraft = data.originalDraft || {};
                state.transfers = data.transfers || [];
                state.overrides = data.overrides || {};
                state.closingLines = data.closingLines || {};
                firebaseInitialSyncDone = true;
                // Inject pre-seeded closing lines for games that were live before caching deployed
                let preseeded = false;
                if (typeof PRESEED_CLOSING_LINES !== 'undefined') {
                    for (const [gid, line] of Object.entries(PRESEED_CLOSING_LINES)) {
                        if (!state.closingLines[gid] || state.closingLines[gid].spread !== line.spread) {
                            state.closingLines[gid] = line;
                            preseeded = true;
                        }
                    }
                    if (preseeded) saveState();
                }
                console.log('State synced from Firebase');
                // Backfill cached closing lines into existing game objects
                Object.values(state.games).forEach(g => {
                    if ((g.spread === null || g.spread === undefined) && state.closingLines[g.id]) {
                        g.spread = state.closingLines[g.id].spread;
                        g.spreadDetails = state.closingLines[g.id].spreadDetails;
                        g.lineLabel = 'locked';
                    }
                });
                renderStandingsBar();
                renderLiveTicker();
                // Re-render current view if games are loaded
                if (Object.keys(state.games).length > 0) {
                    if (state.currentRound === 'standings') {
                        renderStandings();
                    } else {
                        const games = Object.values(state.games).filter(g => {
                            const dates = ROUND_DATES[state.currentRound];
                            if (!dates) return false;
                            const gameDate = new Date(g.date).toISOString().slice(0,10).replace(/-/g,'');
                            return dates.includes(gameDate);
                        });
                        if (games.length > 0) renderGames(games);
                    }
                }
            } else if (typeof DEFAULT_PLAYERS !== 'undefined' && typeof DEFAULT_DRAFT !== 'undefined') {
                // Firebase is empty — seed with defaults
                console.log('Firebase empty, seeding with defaults...');
                state.players = JSON.parse(JSON.stringify(DEFAULT_PLAYERS));
                state.originalDraft = { ...DEFAULT_DRAFT };
                state.teamControl = { ...DEFAULT_DRAFT };
                state.transfers = [];
                state.overrides = {};
                state.closingLines = {};
                firebaseInitialSyncDone = true;
                saveState();
            }
        });

        return true;
    } catch (err) {
        console.error('Firebase init failed:', err);
        loadStateLocal();
        return false;
    }
}

function saveState() {
    if (firebaseReady && db) {
        db.ref('league').set({
            players: state.players,
            teamControl: state.teamControl,
            originalDraft: state.originalDraft,
            transfers: state.transfers,
            overrides: state.overrides,
            closingLines: state.closingLines
        }).catch(err => {
            console.error('Firebase save failed:', err);
            saveStateLocal();
        });
    } else {
        saveStateLocal();
    }
}

function saveStateLocal() {
    const toSave = {
        players: state.players,
        teamControl: state.teamControl,
        originalDraft: state.originalDraft,
        transfers: state.transfers,
        overrides: state.overrides,
        closingLines: state.closingLines
    };
    localStorage.setItem('marchMadness2026', JSON.stringify(toSave));
}

function loadStateLocal() {
    const saved = localStorage.getItem('marchMadness2026');
    if (saved) {
        const parsed = JSON.parse(saved);
        state.players = parsed.players || state.players;
        state.teamControl = parsed.teamControl || {};
        state.originalDraft = parsed.originalDraft || {};
        state.transfers = parsed.transfers || [];
        state.overrides = parsed.overrides || {};
        state.closingLines = parsed.closingLines || {};
    }
}

// Pre-seeded closing lines for games that were already live before caching was deployed
const PRESEED_CLOSING_LINES = {
    '401856479': { spread: -2.5,  spreadDetails: 'OSU -2.5' },   // TCU @ Ohio State
    '401856489': { spread: -13.5, spreadDetails: 'NEB -13.5' },   // Troy @ Nebraska
    '401856480': { spread: -10.5, spreadDetails: 'WIS -10.5' },   // High Point @ Wisconsin
    '401856482': { spread: -3.5,  spreadDetails: 'LOU -3.5' }     // South Florida @ Louisville
};

// ---- ESPN API ----
async function fetchGamesForRound(round) {
    const dates = ROUND_DATES[round];
    if (!dates) return [];

    const allGames = [];
    for (const date of dates) {
        try {
            const url = `${ESPN_BASE}?dates=${date}&groups=${TOURNAMENT_GROUP}&limit=50`;
            const resp = await fetch(url);
            if (!resp.ok) continue;
            const data = await resp.json();
            if (data.events) {
                allGames.push(...data.events);
            }
        } catch (err) {
            console.warn(`Failed to fetch games for ${date}:`, err);
        }
    }
    return allGames;
}

function parseGame(event) {
    const comp = event.competitions?.[0];
    if (!comp) return null;

    const competitors = comp.competitors || [];
    const home = competitors.find(c => c.homeAway === 'home');
    const away = competitors.find(c => c.homeAway === 'away');
    if (!home || !away) return null;

    let spread = null;
    let spreadDetails = '';
    let lineLabel = 'LINE';
    const odds = comp.odds || event.odds || [];
    if (odds.length > 0) {
        const oddsData = odds[0];
        const closingLine = oddsData.pointSpread?.home?.close?.line;
        if (closingLine !== undefined && closingLine !== null) {
            spread = parseFloat(closingLine);
            const homeAbbr = home.team.abbreviation;
            spreadDetails = `${homeAbbr} ${spread > 0 ? '+' : ''}${spread}`;
            lineLabel = 'locked';
            // Cache the closing line so it persists when ESPN removes it during live games
            state.closingLines[event.id] = { spread, spreadDetails };
        } else {
            // ESPN no longer returning closing line — use cached value if available
            const cached = state.closingLines[event.id];
            if (cached) {
                spread = cached.spread;
                spreadDetails = cached.spreadDetails;
                lineLabel = 'locked';
            } else {
                // Try other ESPN spread fields as fallback
                const fallbackLine = oddsData.pointSpread?.home?.current?.line
                    ?? oddsData.pointSpread?.home?.open?.line
                    ?? oddsData.spread;
                if (fallbackLine !== undefined && fallbackLine !== null) {
                    spread = parseFloat(fallbackLine);
                    const homeAbbr = home.team.abbreviation;
                    spreadDetails = oddsData.details || `${homeAbbr} ${spread > 0 ? '+' : ''}${spread}`;
                } else {
                    spread = null;
                    spreadDetails = oddsData.details || '';
                }
                lineLabel = 'live';
            }
        }
    } else {
        // No odds at all from ESPN — check cache
        const cached = state.closingLines[event.id];
        if (cached) {
            spread = cached.spread;
            spreadDetails = cached.spreadDetails;
            lineLabel = 'locked';
        }
    }

    const status = event.status?.type;
    const gameState = status?.state || 'pre';

    const game = {
        id: event.id,
        date: event.date,
        name: event.name,
        shortName: event.shortName,
        broadcast: comp.broadcasts?.[0]?.names?.[0] || event.broadcast || '',
        venue: comp.venue?.fullName || '',
        state: gameState,
        completed: status?.completed || false,
        statusDetail: status?.detail || status?.description || '',
        clock: event.status?.displayClock,
        period: event.status?.period,
        home: {
            id: home.team.id,
            name: home.team.displayName || home.team.location,
            abbreviation: home.team.abbreviation,
            shortName: home.team.location || home.team.name,
            seed: home.curatedRank?.current || 0,
            score: parseInt(home.score) || 0,
            record: home.records?.[0]?.summary || '',
            logo: home.team.logo
        },
        away: {
            id: away.team.id,
            name: away.team.displayName || away.team.location,
            abbreviation: away.team.abbreviation,
            shortName: away.team.location || away.team.name,
            seed: away.curatedRank?.current || 0,
            score: parseInt(away.score) || 0,
            record: away.records?.[0]?.summary || '',
            logo: away.team.logo
        },
        spread: spread,
        spreadDetails: spreadDetails,
        lineLabel: lineLabel,
        region: comp.notes?.[0]?.headline || ''
    };

    // Apply manual overrides
    const override = state.overrides[game.id];
    if (override) {
        if (override.spread !== undefined && override.spread !== null && override.spread !== '') {
            game.spread = parseFloat(override.spread);
            game.spreadDetails = `MANUAL: ${game.home.abbreviation} ${game.spread > 0 ? '+' : ''}${game.spread}`;
        }
        if (override.homeScore !== undefined && override.homeScore !== '') {
            game.home.score = parseInt(override.homeScore);
        }
        if (override.awayScore !== undefined && override.awayScore !== '') {
            game.away.score = parseInt(override.awayScore);
        }
    }

    state.teams[game.home.id] = { id: game.home.id, name: game.home.name, abbreviation: game.home.abbreviation, seed: game.home.seed };
    state.teams[game.away.id] = { id: game.away.id, name: game.away.name, abbreviation: game.away.abbreviation, seed: game.away.seed };

    return game;
}

// ---- Spread Logic ----
function analyzeSpread(game) {
    if (!game.completed || game.spread === null || game.spread === undefined) {
        return null;
    }

    const homeScore = game.home.score;
    const awayScore = game.away.score;
    const margin = homeScore - awayScore;
    const spread = game.spread;
    const winner = homeScore > awayScore ? 'home' : 'away';
    const winnerTeam = winner === 'home' ? game.home : game.away;
    const loserTeam = winner === 'home' ? game.away : game.home;
    const atsMargin = margin + spread;

    let winnerCovered;
    if (winner === 'home') {
        winnerCovered = atsMargin > 0;
    } else {
        winnerCovered = atsMargin < 0;
    }

    const push = atsMargin === 0;

    return {
        winner, winnerTeam, loserTeam,
        margin: Math.abs(margin),
        spread, atsMargin, winnerCovered, push,
        homeScore, awayScore
    };
}

function processGameResult(game) {
    const analysis = analyzeSpread(game);
    if (!analysis) return null;

    const winnerController = state.teamControl[analysis.winnerTeam.id];
    const loserController = state.teamControl[analysis.loserTeam.id];

    let transfer = null;

    if (!analysis.winnerCovered && !analysis.push && winnerController !== undefined && loserController !== undefined && winnerController !== loserController) {
        const alreadyTransferred = state.transfers.find(t =>
            t.gameId === game.id && t.teamId === analysis.winnerTeam.id
        );

        if (!alreadyTransferred) {
            transfer = {
                round: state.currentRound,
                gameId: game.id,
                teamId: analysis.winnerTeam.id,
                teamName: analysis.winnerTeam.name,
                fromPlayer: winnerController,
                toPlayer: loserController
            };
            state.transfers.push(transfer);
            state.teamControl[analysis.winnerTeam.id] = loserController;
            saveState();
        } else {
            transfer = alreadyTransferred;
        }
    }

    return { analysis, transfer };
}

// ---- Elimination Tracking ----
function getEliminatedTeamIds() {
    const eliminated = new Set();
    Object.values(state.games).forEach(g => {
        if (g.completed || g.state === 'post') {
            const homeScore = g.home.score;
            const awayScore = g.away.score;
            if (homeScore > awayScore) {
                eliminated.add(String(g.away.id));
            } else if (awayScore > homeScore) {
                eliminated.add(String(g.home.id));
            }
        }
    });
    return eliminated;
}

// ---- UI Rendering ----
function renderLiveTicker() {
    const ticker = document.getElementById('liveTicker');
    if (!ticker) return;

    // Show only in-progress games
    const activeGames = Object.values(state.games).filter(g =>
        g.state === 'in'
    );

    if (activeGames.length === 0) {
        ticker.innerHTML = '';
        return;
    }

    // Sort: live first, then final by most recent
    activeGames.sort((a, b) => {
        const aLive = a.state === 'in' ? 0 : 1;
        const bLive = b.state === 'in' ? 0 : 1;
        if (aLive !== bLive) return aLive - bLive;
        return new Date(b.date) - new Date(a.date);
    });

    ticker.innerHTML = activeGames.map(game => {
        const isLive = game.state === 'in';
        const isFinal = game.state === 'post' || game.completed;
        const cardClass = isFinal ? 'final' : '';

        const homeWins = game.home.score > game.away.score;
        const awayWins = game.away.score > game.home.score;
        const homeLoserClass = isFinal && awayWins ? 'loser' : '';
        const awayLoserClass = isFinal && homeWins ? 'loser' : '';

        let clockHtml = '';
        if (isLive) {
            const periodText = game.period ? (game.period === 1 ? '1st' : '2nd') : '';
            const clockText = game.clock || '';
            clockHtml = `<span class="ticker-clock">${clockText}</span><span>${periodText}</span>`;
        } else if (isFinal) {
            clockHtml = `<span class="ticker-clock">FINAL</span>`;
        }

        const broadcast = game.broadcast || '';

        return `
        <a href="#" class="ticker-game ${cardClass}" onclick="event.preventDefault();scrollToGame('${game.id}')">
            <div class="ticker-status">
                ${clockHtml}
                <span>${broadcast}</span>
            </div>
            <div class="ticker-teams">
                <div class="ticker-team ${awayLoserClass}">
                    <span class="ticker-team-name"><span class="ticker-seed">${game.away.seed || ''}</span> ${game.away.abbreviation}</span>
                    <span class="ticker-score">${game.away.score}</span>
                </div>
                <div class="ticker-team ${homeLoserClass}">
                    <span class="ticker-team-name"><span class="ticker-seed">${game.home.seed || ''}</span> ${game.home.abbreviation}</span>
                    <span class="ticker-score">${game.home.score}</span>
                </div>
            </div>
        </a>`;
    }).join('');
}

function scrollToGame(gameId) {
    const card = document.querySelector(`.game-card[data-game-id="${gameId}"]`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.outline = '2px solid var(--accent)';
        setTimeout(() => card.style.outline = '', 2000);
    }
}

function renderStandingsBar() {
    const bar = document.getElementById('standingsBar');
    if (!bar) return;
    const eliminated = getEliminatedTeamIds();
    const counts = {};
    state.players.forEach(p => { counts[p.id] = 0; });
    Object.entries(state.teamControl).forEach(([teamId, playerId]) => {
        if (counts[playerId] !== undefined && !eliminated.has(String(teamId))) {
            counts[playerId]++;
        }
    });

    bar.innerHTML = state.players.map(p =>
        `<a href="#" class="player-chip" data-player-id="${p.id}" onclick="event.preventDefault();switchRound('standings');setTimeout(()=>{const el=document.getElementById('player-row-${p.id}');if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.style.outline='2px solid ${p.color}';setTimeout(()=>el.style.outline='',2000);}},100);">
            <span class="dot" style="background:${p.color}"></span>
            <span>${p.name}</span>
            <span class="count">${counts[p.id] || 0} teams</span>
        </a>`
    ).join('');
}

function renderGames(games) {
    const container = document.getElementById('gamesContainer');
    if (!container) return;

    if (!games || games.length === 0) {
        container.innerHTML = `
            <div class="no-games">
                <h3>No games found for this round</h3>
                <p>Games will appear here once ESPN has the matchups scheduled.</p>
            </div>`;
        return;
    }

    const regionMap = {};
    games.forEach(g => {
        const region = g.region || 'Tournament';
        if (!regionMap[region]) regionMap[region] = [];
        regionMap[region].push(g);
    });

    let html = '';
    for (const [region, regionGames] of Object.entries(regionMap)) {
        const cleanRegion = region.replace(/NCAA Men's Basketball Championship\s*-\s*/i, '');
        html += `<div class="region-header">${cleanRegion}</div>`;
        regionGames.sort((a, b) => new Date(a.date) - new Date(b.date));
        regionGames.forEach(game => {
            html += renderGameCard(game);
        });
    }

    container.innerHTML = html;

    container.querySelectorAll('.game-card').forEach(card => {
        card.addEventListener('click', () => showGameDetail(card.dataset.gameId));
    });
}

function renderGameCard(game) {
    const result = game.completed ? analyzeSpread(game) : null;

    const homeController = state.teamControl[game.home.id];
    const awayController = state.teamControl[game.away.id];
    const homePlayer = state.players.find(p => p.id === homeController);
    const awayPlayer = state.players.find(p => p.id === awayController);

    const isLive = game.state === 'in';
    const isFinal = game.state === 'post' || game.completed;
    const cardClass = isLive ? 'live' : isFinal ? 'final' : '';

    // Status display
    let statusHtml = '';
    if (isLive) {
        const periodText = game.period ? `${game.period === 1 ? '1st' : '2nd'} Half` : '';
        const clockText = game.clock ? ` ${game.clock}` : '';
        statusHtml = `<span class="game-status live">LIVE</span><span style="color:var(--text-secondary);font-size:0.75rem;font-weight:600;margin-left:0.75rem">${periodText}${clockText}</span>`;
    } else if (isFinal) {
        statusHtml = `<span class="game-status final">FINAL</span>`;
    } else {
        const d = new Date(game.date);
        const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        statusHtml = `<span class="game-status pre">${timeStr}</span>`;
    }

    // Spread banner — use game object spread, fall back to closingLines cache
    let displaySpread = game.spread;
    let displaySpreadDetails = game.spreadDetails;
    if ((displaySpread === null || displaySpread === undefined) && state.closingLines[game.id]) {
        displaySpread = state.closingLines[game.id].spread;
        displaySpreadDetails = state.closingLines[game.id].spreadDetails;
    }
    let spreadBanner = '';
    if (displaySpread !== null && displaySpread !== undefined) {
        const lineText = displaySpreadDetails || formatSpread(displaySpread, game.home.abbreviation);
        const lockIcon = (isLive || isFinal) ? ' \u{1F512}' : '';
        spreadBanner = `<div class="game-spread-banner">LINE: ${lineText}${lockIcon}</div>`;
    }

    // Team rows
    const homeWinner = result && result.winner === 'home';
    const awayWinner = result && result.winner === 'away';
    const homeRowClass = isFinal ? (homeWinner ? 'winner' : 'loser') : '';
    const awayRowClass = isFinal ? (awayWinner ? 'winner' : 'loser') : '';

    const homePlayerTag = homePlayer
        ? `<span class="team-player-tag" style="background:${homePlayer.color}22;color:${homePlayer.color};border:1px solid ${homePlayer.color}44">${homePlayer.name}</span>`
        : '';
    const awayPlayerTag = awayPlayer
        ? `<span class="team-player-tag" style="background:${awayPlayer.color}22;color:${awayPlayer.color};border:1px solid ${awayPlayer.color}44">${awayPlayer.name}</span>`
        : '';

    // Spread result
    let spreadResultHtml = '';
    if (result && displaySpread !== null) {
        if (result.push) {
            spreadResultHtml = `<div class="spread-result push">PUSH \u2014 No transfer</div>`;
        } else if (result.winnerCovered) {
            spreadResultHtml = `<div class="spread-result covered">\u2713 ${result.winnerTeam.abbreviation || result.winnerTeam.shortName} COVERED (won by ${result.margin}, spread ${formatSpread(displaySpread, game.home.abbreviation)})</div>`;
        } else {
            spreadResultHtml = `<div class="spread-result not-covered">\u2717 ${result.winnerTeam.abbreviation || result.winnerTeam.shortName} DID NOT COVER (won by ${result.margin}, spread ${formatSpread(displaySpread, game.home.abbreviation)})</div>`;
        }
    }

    // Transfer notice
    let transferHtml = '';
    const transfer = state.transfers.find(t => t.gameId === game.id);
    if (transfer) {
        const from = state.players.find(p => p.id === transfer.fromPlayer);
        const to = state.players.find(p => p.id === transfer.toPlayer);
        transferHtml = `<div class="transfer-notice">\u{1F504} ${transfer.teamName} transfers: ${from?.name || '?'} \u2192 ${to?.name || '?'}</div>`;
    }

    const broadcastText = game.broadcast ? `${game.broadcast}` : '';

    return `
    <div class="game-card ${cardClass}" data-game-id="${game.id}">
        <div class="game-meta">
            <span class="game-time">${broadcastText}</span>
            <div style="display:flex;align-items:center">${statusHtml}</div>
        </div>
        ${spreadBanner}
        <div class="game-teams">
            <div class="team-row ${awayRowClass}">
                <span class="team-seed">${game.away.seed || '-'}</span>
                <span class="team-name">${game.away.shortName || game.away.name}${game.away.record ? ` <span class="team-record-inline">(${game.away.record})</span>` : ''}</span>
                ${awayPlayerTag}
                <span class="team-score">${(isLive || isFinal) ? game.away.score : ''}</span>
            </div>
            <div class="team-row ${homeRowClass}">
                <span class="team-seed">${game.home.seed || '-'}</span>
                <span class="team-name">${game.home.shortName || game.home.name}${game.home.record ? ` <span class="team-record-inline">(${game.home.record})</span>` : ''}</span>
                ${homePlayerTag}
                <span class="team-score">${(isLive || isFinal) ? game.home.score : ''}</span>
            </div>
        </div>
        ${spreadResultHtml}
        ${transferHtml}
    </div>`;
}

function formatSpread(spread, homeAbbr) {
    if (spread === null || spread === undefined) return '';
    const sign = spread > 0 ? '+' : '';
    return `${homeAbbr} ${sign}${spread}`;
}

function showGameDetail(gameId) {
    const game = state.games[gameId];
    if (!game) return;

    const modal = document.getElementById('gameDetailModal');
    const body = document.getElementById('gameDetailBody');
    if (!modal || !body) return;

    const result = game.completed ? analyzeSpread(game) : null;
    const homePlayer = state.players.find(p => p.id === state.teamControl[game.home.id]);
    const awayPlayer = state.players.find(p => p.id === state.teamControl[game.away.id]);

    let resultHtml = '';
    if (result) {
        resultHtml = `
        <div class="detail-info" style="margin-top:1rem">
            <div class="detail-info-item">
                <div class="detail-info-label">Margin</div>
                <div class="detail-info-value">${result.margin} pts</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">ATS Result</div>
                <div class="detail-info-value" style="color:${result.winnerCovered ? 'var(--green)' : result.push ? 'var(--yellow)' : 'var(--red)'}">
                    ${result.winnerCovered ? 'COVERED' : result.push ? 'PUSH' : 'DID NOT COVER'}
                </div>
            </div>
        </div>`;
    }

    body.innerHTML = `
        <div class="detail-matchup">
            <div class="detail-team">${game.away.seed ? `(${game.away.seed}) ` : ''}${game.away.name}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);margin:0.2rem 0">Controlled by: ${awayPlayer?.name || 'Unassigned'}</div>
            <div class="detail-vs">${game.completed ? `${game.away.score} - ${game.home.score}` : 'VS'}</div>
            <div class="detail-team">${game.home.seed ? `(${game.home.seed}) ` : ''}${game.home.name}</div>
            <div style="font-size:0.7rem;color:var(--text-muted);margin:0.2rem 0">Controlled by: ${homePlayer?.name || 'Unassigned'}</div>
        </div>
        <div class="detail-info">
            <div class="detail-info-item">
                <div class="detail-info-label">Spread</div>
                <div class="detail-info-value">${game.spreadDetails || 'N/A'}</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">Status</div>
                <div class="detail-info-value">${game.statusDetail}</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">Venue</div>
                <div class="detail-info-value" style="font-size:0.8rem">${game.venue || 'TBD'}</div>
            </div>
            <div class="detail-info-item">
                <div class="detail-info-label">Broadcast</div>
                <div class="detail-info-value">${game.broadcast || 'TBD'}</div>
            </div>
        </div>
        ${resultHtml}
    `;

    modal.classList.remove('hidden');
}

// ---- Standings View ----
function renderStandings() {
    const view = document.getElementById('standingsView');
    if (!view) return;

    const eliminated = getEliminatedTeamIds();

    const playerStats = state.players.map(player => {
        const controlledTeams = Object.entries(state.teamControl)
            .filter(([_, pid]) => pid === player.id)
            .map(([tid]) => {
                const team = state.teams[tid] || { id: tid, name: `Team ${tid}`, abbreviation: '??', seed: 0 };
                return { ...team, eliminated: eliminated.has(String(tid)) };
            });

        // Sort: active teams first, then eliminated at the end
        controlledTeams.sort((a, b) => (a.eliminated ? 1 : 0) - (b.eliminated ? 1 : 0));

        const activeTeams = controlledTeams.filter(t => !t.eliminated);
        const transfersIn = state.transfers.filter(t => t.toPlayer === player.id);
        const transfersOut = state.transfers.filter(t => t.fromPlayer === player.id);

        return { player, controlledTeams, activeTeams, transfersIn, transfersOut, totalActive: activeTeams.length };
    });

    playerStats.sort((a, b) => b.totalActive - a.totalActive);

    let html = `
    <table class="standings-table">
        <thead>
            <tr>
                <th>#</th>
                <th>Player</th>
                <th class="center">Teams Alive</th>
                <th class="center">Transfers In</th>
                <th class="center">Transfers Out</th>
                <th>Current Teams</th>
            </tr>
        </thead>
        <tbody>`;

    playerStats.forEach((ps, i) => {
        const teamChips = ps.controlledTeams.map(t => {
            const wasOriginal = state.originalDraft[t.id] === ps.player.id;
            let chipClass = '';
            if (t.eliminated) {
                chipClass = 'eliminated';
            } else if (!wasOriginal) {
                chipClass = 'transferred-in';
            }
            return `<span class="standings-team-chip ${chipClass}">${t.seed ? `(${t.seed}) ` : ''}${t.abbreviation || t.name}</span>`;
        }).join('');

        html += `
        <tr id="player-row-${ps.player.id}">
            <td style="font-weight:800;color:var(--text-muted)">${i + 1}</td>
            <td>
                <div class="standings-player-name">
                    <span class="dot" style="background:${ps.player.color};width:10px;height:10px;border-radius:50%;display:inline-block"></span>
                    ${ps.player.name}
                </div>
            </td>
            <td class="center" style="font-weight:800;font-size:1.2rem">${ps.totalActive}</td>
            <td class="center" style="color:var(--green);font-weight:700">${ps.transfersIn.length}</td>
            <td class="center" style="color:var(--red);font-weight:700">${ps.transfersOut.length}</td>
            <td><div class="standings-teams-list">${teamChips || '<span style="color:var(--text-muted);font-size:0.8rem">None</span>'}</div></td>
        </tr>`;
    });

    html += '</tbody></table>';

    if (state.transfers.length > 0) {
        html += `<div class="transfer-log"><h3>Transfer Log</h3>`;
        state.transfers.forEach(t => {
            const from = state.players.find(p => p.id === t.fromPlayer);
            const to = state.players.find(p => p.id === t.toPlayer);
            const roundName = ROUND_NAMES[t.round] || `Round ${t.round}`;
            html += `
            <div class="transfer-entry">
                <span style="color:var(--text-muted);font-size:0.7rem;min-width:80px">${roundName}</span>
                <strong>${t.teamName}</strong>
                <span style="color:${from?.color || '#888'}">${from?.name || '?'}</span>
                <span class="transfer-arrow">\u2192</span>
                <span style="color:${to?.color || '#888'}">${to?.name || '?'}</span>
            </div>`;
        });
        html += '</div>';
    }

    view.innerHTML = html;
}

// ---- Bracket View ----
const BRACKET_SEED_ORDER = [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]];

// Maps any seed to its bracket slot within a round
function getBracketSlot(seed, round) {
    if (!seed) return 99;
    const groups = {
        64: [[1,16],[8,9],[5,12],[4,13],[6,11],[3,14],[7,10],[2,15]],
        32: [[1,16,8,9],[5,12,4,13],[6,11,3,14],[7,10,2,15]],
        16: [[1,16,8,9,5,12,4,13],[6,11,3,14,7,10,2,15]],
        8:  [[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]]
    };
    const g = groups[round];
    if (!g) return 99;
    for (let i = 0; i < g.length; i++) {
        if (g[i].includes(seed)) return i;
    }
    return 99;
}

function getRegionName(regionStr) {
    const clean = (regionStr || '').replace(/NCAA Men's Basketball Championship\s*-\s*/i, '');
    const m = clean.match(/^(.+?)\s*Region/i);
    return m ? m[1].trim() : clean.split(' - ')[0].trim() || '';
}

async function fetchAllRoundGames() {
    const today = new Date().toISOString().slice(0,10).replace(/-/g,'');
    for (const round of [64, 32, 16, 8, 4, 2]) {
        const dates = ROUND_DATES[round];
        // Only fetch rounds that have started or are upcoming (within 2 days)
        const earliest = dates[0];
        if (parseInt(earliest) > parseInt(today) + 2) continue;
        try {
            const events = await fetchGamesForRound(round);
            events.forEach(event => {
                const game = parseGame(event);
                if (game) {
                    if ((game.spread === null || game.spread === undefined) && state.closingLines[game.id]) {
                        game.spread = state.closingLines[game.id].spread;
                        game.spreadDetails = state.closingLines[game.id].spreadDetails;
                        game.lineLabel = 'locked';
                    }
                    const gd = new Date(game.date).toISOString().slice(0,10).replace(/-/g,'');
                    for (const [r, ds] of Object.entries(ROUND_DATES)) {
                        if (ds.includes(gd)) { game.bracketRound = parseInt(r); break; }
                    }
                    state.games[game.id] = game;
                    if (game.completed) processGameResult(game);
                }
            });
        } catch(e) { console.warn('Bracket fetch error:', e); }
    }
}

function buildBracketData() {
    const bracket = {};
    Object.values(state.games).forEach(game => {
        const region = getRegionName(game.region);
        if (!region) return;
        const round = game.bracketRound;
        if (!round) return;
        if (!bracket[region]) bracket[region] = {};
        if (!bracket[region][round]) bracket[region][round] = [];
        bracket[region][round].push(game);
    });

    // Sort games within each round by bracket position
    Object.values(bracket).forEach(rd => {
        [64, 32, 16, 8].forEach(r => {
            if (rd[r]) {
                rd[r].sort((a, b) => {
                    const aSlot = Math.min(getBracketSlot(a.away.seed, r), getBracketSlot(a.home.seed, r));
                    const bSlot = Math.min(getBracketSlot(b.away.seed, r), getBracketSlot(b.home.seed, r));
                    return aSlot - bSlot;
                });
            }
        });
    });

    return bracket;
}

function renderBktMatchup(game) {
    if (!game) {
        return `<div class="bkt-game bkt-tbd"><div class="bkt-team-row"><span class="bkt-name">TBD</span></div><div class="bkt-team-row"><span class="bkt-name">TBD</span></div></div>`;
    }

    const isLive = game.state === 'in';
    const isFinal = game.state === 'post' || game.completed;
    const showScore = isLive || isFinal;
    const statusClass = isLive ? 'bkt-live' : isFinal ? 'bkt-final' : '';

    const awayPlayer = state.players.find(p => p.id === state.teamControl[game.away.id]);
    const homePlayer = state.players.find(p => p.id === state.teamControl[game.home.id]);
    const homeWins = isFinal && game.home.score > game.away.score;
    const awayWins = isFinal && game.away.score > game.home.score;

    function teamRow(team, player, isWinner, isLoser) {
        const cls = isWinner ? 'bkt-winner' : isLoser ? 'bkt-loser' : '';
        return `<div class="bkt-team-row ${cls}">
            <span class="bkt-seed">${team.seed || ''}</span>
            <span class="bkt-name">${team.abbreviation}</span>
            ${player ? `<span class="bkt-player" style="color:${player.color}">${player.name}</span>` : '<span class="bkt-player"></span>'}
            ${showScore ? `<span class="bkt-score">${team.score}</span>` : ''}
        </div>`;
    }

    return `<div class="bkt-game ${statusClass}" data-game-id="${game.id}" onclick="scrollToGameFromBracket('${game.id}')">
        ${teamRow(game.away, awayPlayer, awayWins, homeWins)}
        ${teamRow(game.home, homePlayer, homeWins, awayWins)}
    </div>`;
}

function renderBktRound(games, expectedCount) {
    let html = '<div class="bkt-round">';
    for (let i = 0; i < expectedCount; i += 2) {
        html += '<div class="bkt-pair">';
        html += renderBktMatchup(games?.[i] || null);
        html += renderBktMatchup(games?.[i + 1] || null);
        html += '</div>';
    }
    // Handle odd counts (E8 has 1 game)
    if (expectedCount === 1) {
        html = '<div class="bkt-round"><div class="bkt-pair bkt-single">';
        html += renderBktMatchup(games?.[0] || null);
        html += '</div>';
    }
    html += '</div>';
    return html;
}

function scrollToGameFromBracket(gameId) {
    // Switch to the appropriate round tab and scroll to the game
    const game = state.games[gameId];
    if (!game || !game.bracketRound) return;
    switchRound(game.bracketRound);
    setTimeout(() => {
        const card = document.querySelector(`.game-card[data-game-id="${gameId}"]`);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.outline = '2px solid var(--accent)';
            setTimeout(() => card.style.outline = '', 2000);
        }
    }, 500);
}

async function renderBracket() {
    const view = document.getElementById('bracketView');
    if (!view) return;

    view.innerHTML = '<div class="loading">Loading full bracket from ESPN...</div>';

    await fetchAllRoundGames();
    const bracket = buildBracketData();
    const regions = Object.keys(bracket);

    if (regions.length === 0) {
        view.innerHTML = '<div class="no-games"><h3>No bracket data available yet</h3></div>';
        return;
    }

    // Layout: split regions into left/right halves
    const leftRegions = regions.slice(0, 2);
    const rightRegions = regions.slice(2, 4);

    let html = '<div class="bracket-scroll"><div class="bracket-container">';

    // Left half
    html += '<div class="bracket-half bracket-left">';
    leftRegions.forEach(region => {
        const rd = bracket[region] || {};
        html += `<div class="bracket-region">`;
        html += `<div class="bracket-region-label">${region}</div>`;
        html += '<div class="bracket-rounds">';
        html += renderBktRound(rd[64], 8);
        html += renderBktRound(rd[32], 4);
        html += renderBktRound(rd[16], 2);
        html += renderBktRound(rd[8], 1);
        html += '</div></div>';
    });
    html += '</div>';

    // Center - Final Four & Championship
    html += '<div class="bracket-center">';
    html += '<div class="bracket-center-label">Final Four</div>';
    html += '<div class="bkt-round">';
    html += '<div class="bkt-pair bkt-single">' + renderBktMatchup(null) + '</div>';
    html += '</div>';
    html += '<div class="bracket-center-label">Championship</div>';
    html += '<div class="bkt-round">';
    html += '<div class="bkt-pair bkt-single">' + renderBktMatchup(null) + '</div>';
    html += '</div>';
    html += '<div class="bracket-center-label">Final Four</div>';
    html += '<div class="bkt-round">';
    html += '<div class="bkt-pair bkt-single">' + renderBktMatchup(null) + '</div>';
    html += '</div>';
    html += '</div>';

    // Right half (rounds in reverse order)
    html += '<div class="bracket-half bracket-right">';
    rightRegions.forEach(region => {
        const rd = bracket[region] || {};
        html += `<div class="bracket-region">`;
        html += `<div class="bracket-region-label">${region}</div>`;
        html += '<div class="bracket-rounds">';
        html += renderBktRound(rd[8], 1);
        html += renderBktRound(rd[16], 2);
        html += renderBktRound(rd[32], 4);
        html += renderBktRound(rd[64], 8);
        html += '</div></div>';
    });
    html += '</div>';

    html += '</div></div>';
    view.innerHTML = html;
}

// ---- Navigation & Refresh ----
async function refreshCurrentRound() {
    const container = document.getElementById('gamesContainer');
    const standingsView = document.getElementById('standingsView');
    const bracketView = document.getElementById('bracketView');

    if (state.currentRound === 'standings') {
        if (container) container.classList.add('hidden');
        if (bracketView) bracketView.classList.add('hidden');
        if (standingsView) standingsView.classList.remove('hidden');
        renderStandings();
        return;
    }

    if (state.currentRound === 'bracket') {
        if (container) container.classList.add('hidden');
        if (standingsView) standingsView.classList.add('hidden');
        if (bracketView) bracketView.classList.remove('hidden');
        renderBracket();
        return;
    }

    if (container) {
        container.classList.remove('hidden');
        container.innerHTML = '<div class="loading">Loading games from ESPN...</div>';
    }
    if (standingsView) standingsView.classList.add('hidden');
    if (bracketView) bracketView.classList.add('hidden');

    try {
        const events = await fetchGamesForRound(state.currentRound);
        const closingLinesBefore = JSON.stringify(state.closingLines);
        const games = events.map(parseGame).filter(Boolean);

        // Backfill spread from closing lines cache for games where ESPN removed odds
        games.forEach(g => {
            if ((g.spread === null || g.spread === undefined) && state.closingLines[g.id]) {
                g.spread = state.closingLines[g.id].spread;
                g.spreadDetails = state.closingLines[g.id].spreadDetails;
                g.lineLabel = 'locked';
            }
        });

        games.forEach(g => { state.games[g.id] = g; });

        games.forEach(g => {
            if (g.completed) {
                processGameResult(g);
            }
        });

        // Persist any newly cached closing lines (only after Firebase has loaded to avoid overwriting real data)
        if (firebaseInitialSyncDone && JSON.stringify(state.closingLines) !== closingLinesBefore) {
            saveState();
        }

        renderGames(games);
        renderStandingsBar();
        renderLiveTicker();
    } catch (err) {
        console.error('Error refreshing:', err);
        if (container) container.innerHTML = `<div class="no-games"><h3>Error loading games</h3><p>${err.message}</p></div>`;
    }
}

function switchRound(round) {
    state.currentRound = round;
    document.querySelectorAll('.round-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.round === String(round));
    });
    refreshCurrentRound();
}

// ---- Init (public view) ----
function init() {
    initFirebase();

    // Round tabs
    document.querySelectorAll('.round-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const r = tab.dataset.round;
            const round = (r === 'standings' || r === 'bracket') ? r : parseInt(r);
            switchRound(round);
        });
    });

    // Refresh button
    const refreshBtn = document.getElementById('refreshNow');
    if (refreshBtn) refreshBtn.addEventListener('click', refreshCurrentRound);

    // Auto-refresh
    let refreshInterval = null;
    const autoRefreshCheckbox = document.getElementById('autoRefresh');

    function startAutoRefresh() {
        if (refreshInterval) clearInterval(refreshInterval);
        refreshInterval = setInterval(refreshCurrentRound, 60000);
    }

    function stopAutoRefresh() {
        if (refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
    }

    if (autoRefreshCheckbox) {
        autoRefreshCheckbox.addEventListener('change', () => {
            if (autoRefreshCheckbox.checked) startAutoRefresh();
            else stopAutoRefresh();
        });
    }

    // Close modals on backdrop click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });

    // Seed any pre-baked closing lines that weren't cached before deployment
    let needsSave = false;
    for (const [gid, line] of Object.entries(PRESEED_CLOSING_LINES)) {
        if (!state.closingLines[gid]) {
            state.closingLines[gid] = line;
            needsSave = true;
        }
    }
    if (needsSave && firebaseInitialSyncDone) {
        saveState();
    }

    // Initial render
    renderStandingsBar();
    refreshCurrentRound();
    if (autoRefreshCheckbox?.checked) startAutoRefresh();
}

document.addEventListener('DOMContentLoaded', init);
