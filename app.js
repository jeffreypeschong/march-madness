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
                renderStandingsBar();
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

// ---- UI Rendering ----
function renderStandingsBar() {
    const bar = document.getElementById('standingsBar');
    if (!bar) return;
    const counts = {};
    state.players.forEach(p => { counts[p.id] = 0; });
    Object.entries(state.teamControl).forEach(([teamId, playerId]) => {
        if (counts[playerId] !== undefined) counts[playerId]++;
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

    // Spread banner
    let spreadBanner = '';
    if (game.spread !== null && game.spread !== undefined) {
        const lineText = game.spreadDetails || formatSpread(game.spread, game.home.abbreviation);
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
    if (result && game.spread !== null) {
        if (result.push) {
            spreadResultHtml = `<div class="spread-result push">PUSH \u2014 No transfer</div>`;
        } else if (result.winnerCovered) {
            spreadResultHtml = `<div class="spread-result covered">\u2713 ${result.winnerTeam.abbreviation || result.winnerTeam.shortName} COVERED (won by ${result.margin}, spread ${formatSpread(game.spread, game.home.abbreviation)})</div>`;
        } else {
            spreadResultHtml = `<div class="spread-result not-covered">\u2717 ${result.winnerTeam.abbreviation || result.winnerTeam.shortName} DID NOT COVER (won by ${result.margin}, spread ${formatSpread(game.spread, game.home.abbreviation)})</div>`;
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

    const playerStats = state.players.map(player => {
        const controlledTeams = Object.entries(state.teamControl)
            .filter(([_, pid]) => pid === player.id)
            .map(([tid]) => state.teams[tid] || { id: tid, name: `Team ${tid}`, abbreviation: '??', seed: 0 });

        const transfersIn = state.transfers.filter(t => t.toPlayer === player.id);
        const transfersOut = state.transfers.filter(t => t.fromPlayer === player.id);

        return { player, controlledTeams, transfersIn, transfersOut, totalControlled: controlledTeams.length };
    });

    playerStats.sort((a, b) => b.totalControlled - a.totalControlled);

    let html = `
    <table class="standings-table">
        <thead>
            <tr>
                <th>#</th>
                <th>Player</th>
                <th class="center">Teams Controlled</th>
                <th class="center">Transfers In</th>
                <th class="center">Transfers Out</th>
                <th>Current Teams</th>
            </tr>
        </thead>
        <tbody>`;

    playerStats.forEach((ps, i) => {
        const teamChips = ps.controlledTeams.map(t => {
            const wasOriginal = state.originalDraft[t.id] === ps.player.id;
            const chipClass = !wasOriginal ? 'transferred-in' : '';
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
            <td class="center" style="font-weight:800;font-size:1.2rem">${ps.totalControlled}</td>
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

// ---- Navigation & Refresh ----
async function refreshCurrentRound() {
    const container = document.getElementById('gamesContainer');
    const standingsView = document.getElementById('standingsView');

    if (state.currentRound === 'standings') {
        if (container) container.classList.add('hidden');
        if (standingsView) standingsView.classList.remove('hidden');
        renderStandings();
        return;
    }

    if (container) {
        container.classList.remove('hidden');
        container.innerHTML = '<div class="loading">Loading games from ESPN...</div>';
    }
    if (standingsView) standingsView.classList.add('hidden');

    try {
        const events = await fetchGamesForRound(state.currentRound);
        const closingLinesBefore = JSON.stringify(state.closingLines);
        const games = events.map(parseGame).filter(Boolean);

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
            const round = tab.dataset.round === 'standings' ? 'standings' : parseInt(tab.dataset.round);
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
