/* ============================================
   ADMIN PANEL LOGIC
   ============================================ */

let adminAuthenticated = false;

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// ---- Password Gate ----
function checkPassword() {
    const input = document.getElementById('passwordInput');
    const pw = input.value.trim();

    if (pw === ADMIN_PASSWORD) {
        adminAuthenticated = true;
        document.getElementById('passwordGate').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        initAdmin();
    } else {
        document.getElementById('passwordError').style.display = 'block';
        input.value = '';
        input.focus();
    }
}

document.getElementById('passwordSubmit').addEventListener('click', checkPassword);
document.getElementById('passwordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') checkPassword();
});

// ---- Admin Init ----
async function initAdmin() {
    // Update status indicator
    const statusEl = document.getElementById('adminStatus');
    if (firebaseReady) {
        statusEl.textContent = 'Firebase Connected';
        statusEl.className = 'admin-status connected';
    } else {
        statusEl.textContent = 'Local Only';
        statusEl.className = 'admin-status local';
    }

    renderPlayerGrid();

    // Load games for team assignments and overrides
    const events = await fetchGamesForRound(64);
    events.map(parseGame).filter(Boolean);

    renderTeamGrid();
    renderTransferDropdowns();
    await loadOverrideGames(64);

    // Wire up buttons
    document.getElementById('savePlayers').addEventListener('click', savePlayers);
    document.getElementById('saveTeams').addEventListener('click', saveTeamAssignments);
    document.getElementById('loadDefaults').addEventListener('click', loadDefaults);
    document.getElementById('doTransfer').addEventListener('click', doManualTransfer);
    document.getElementById('saveOverrides').addEventListener('click', saveOverrides);
    document.getElementById('clearOverrides').addEventListener('click', clearAllOverrides);
    document.getElementById('resetTransfers').addEventListener('click', resetTransfers);
    document.getElementById('resetAll').addEventListener('click', resetAll);
    document.getElementById('overrideRound').addEventListener('change', (e) => {
        loadOverrideGames(parseInt(e.target.value));
    });
}

// ---- Player Management ----
function renderPlayerGrid() {
    const grid = document.getElementById('playerGrid');
    grid.innerHTML = state.players.map((p, i) => `
        <div class="player-row">
            <span class="dot" style="background:${PLAYER_COLORS[i]}"></span>
            <input type="text" value="${p.name}" data-idx="${i}" placeholder="Player ${i + 1}">
        </div>
    `).join('');
}

function savePlayers() {
    document.querySelectorAll('#playerGrid input').forEach(input => {
        const idx = parseInt(input.dataset.idx);
        state.players[idx].name = input.value.trim() || `Player ${idx + 1}`;
    });
    saveState();
    renderTeamGrid();
    renderTransferDropdowns();
    showToast('Player names saved!');
}

// ---- Team Assignments ----
function renderTeamGrid() {
    const grid = document.getElementById('teamGrid');
    const teamList = Object.values(state.teams);

    if (teamList.length === 0) {
        grid.innerHTML = '<div class="loading">No teams loaded yet. Try refreshing.</div>';
        return;
    }

    teamList.sort((a, b) => (a.seed || 99) - (b.seed || 99) || a.name.localeCompare(b.name));

    const playerOptions = state.players.map(p =>
        `<option value="${p.id}">${p.name}</option>`
    ).join('');

    grid.innerHTML = teamList.map(team => `
        <div class="team-row">
            <span class="seed">${team.seed || '?'}</span>
            <span class="name">${team.name}</span>
            <select data-team-id="${team.id}">
                <option value="">-- None --</option>
                ${playerOptions}
            </select>
        </div>
    `).join('');

    // Set current values from originalDraft
    grid.querySelectorAll('select').forEach(sel => {
        const teamId = sel.dataset.teamId;
        if (state.originalDraft[teamId] !== undefined) {
            sel.value = state.originalDraft[teamId];
        }
    });
}

function saveTeamAssignments() {
    const newDraft = {};
    const newControl = { ...state.teamControl };

    document.querySelectorAll('#teamGrid select').forEach(sel => {
        const teamId = sel.dataset.teamId;
        const playerId = sel.value;
        if (playerId !== '') {
            const pid = parseInt(playerId);
            newDraft[teamId] = pid;
            const hasTransfer = state.transfers.find(t => t.teamId === teamId);
            if (!hasTransfer) {
                newControl[teamId] = pid;
            }
        }
    });

    state.originalDraft = newDraft;
    state.teamControl = newControl;

    // Sync non-transferred teams
    Object.entries(newDraft).forEach(([teamId, playerId]) => {
        const hasTransfer = state.transfers.find(t => t.teamId === teamId);
        if (!hasTransfer) {
            state.teamControl[teamId] = playerId;
        }
    });

    saveState();
    showToast('Team assignments saved!');
}

function loadDefaults() {
    if (!confirm('Load default player names and team assignments? This will overwrite current settings.')) return;

    state.players = JSON.parse(JSON.stringify(DEFAULT_PLAYERS));
    state.originalDraft = { ...DEFAULT_DRAFT };
    state.teamControl = { ...DEFAULT_DRAFT }; // Start with draft = control

    // Preserve any existing transfers
    state.transfers.forEach(t => {
        state.teamControl[t.teamId] = t.toPlayer;
    });

    saveState();
    renderPlayerGrid();
    renderTeamGrid();
    renderTransferDropdowns();
    showToast('Defaults loaded!');
}

// ---- Manual Transfers ----
function renderTransferDropdowns() {
    const teamSelect = document.getElementById('transferTeam');
    const playerSelect = document.getElementById('transferTo');

    const teams = Object.values(state.teams).sort((a, b) => a.name.localeCompare(b.name));

    teamSelect.innerHTML = '<option value="">Select Team</option>' +
        teams.map(t => {
            const controller = state.teamControl[t.id];
            const player = state.players.find(p => p.id === controller);
            const ownerText = player ? ` [${player.name}]` : '';
            return `<option value="${t.id}">${t.name}${ownerText}</option>`;
        }).join('');

    playerSelect.innerHTML = '<option value="">Select Player</option>' +
        state.players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
}

function doManualTransfer() {
    const teamId = document.getElementById('transferTeam').value;
    const toPlayerId = document.getElementById('transferTo').value;

    if (!teamId || toPlayerId === '') {
        showToast('Select both a team and a player', 'error');
        return;
    }

    const pid = parseInt(toPlayerId);
    const fromPlayerId = state.teamControl[teamId];
    const team = state.teams[teamId];

    if (fromPlayerId === pid) {
        showToast('Team already belongs to that player', 'error');
        return;
    }

    state.teamControl[teamId] = pid;
    state.transfers.push({
        round: 0,
        gameId: 'manual',
        teamId: teamId,
        teamName: team?.name || teamId,
        fromPlayer: fromPlayerId !== undefined ? fromPlayerId : -1,
        toPlayer: pid
    });

    saveState();
    renderTransferDropdowns();
    showToast(`${team?.name || 'Team'} transferred to ${state.players[pid]?.name || 'player'}!`);
}

// ---- Overrides ----
async function loadOverrideGames(round) {
    const grid = document.getElementById('overrideGrid');
    grid.innerHTML = '<div class="loading">Loading games...</div>';

    const events = await fetchGamesForRound(round);
    const games = events.map(parseGame).filter(Boolean);

    if (games.length === 0) {
        grid.innerHTML = '<div style="color:var(--text-muted);font-size:0.85rem">No games found for this round.</div>';
        return;
    }

    games.sort((a, b) => new Date(a.date) - new Date(b.date));

    grid.innerHTML = games.map(game => {
        const override = state.overrides[game.id] || {};
        return `
        <div class="override-card" data-game-id="${game.id}">
            <div class="game-name">${game.away.shortName} vs ${game.home.shortName}</div>
            <div class="override-inputs">
                <label>Spread (home):</label>
                <input type="number" step="0.5" class="ov-spread" value="${override.spread ?? ''}" placeholder="${game.spread ?? 'N/A'}">
                <label>${game.away.abbreviation}:</label>
                <input type="number" class="ov-away" value="${override.awayScore ?? ''}" placeholder="${game.away.score || 0}">
                <label>${game.home.abbreviation}:</label>
                <input type="number" class="ov-home" value="${override.homeScore ?? ''}" placeholder="${game.home.score || 0}">
            </div>
        </div>`;
    }).join('');
}

function saveOverrides() {
    document.querySelectorAll('.override-card').forEach(card => {
        const gameId = card.dataset.gameId;
        const spread = card.querySelector('.ov-spread').value;
        const awayScore = card.querySelector('.ov-away').value;
        const homeScore = card.querySelector('.ov-home').value;

        if (spread || awayScore || homeScore) {
            state.overrides[gameId] = { spread, homeScore, awayScore };
        } else {
            delete state.overrides[gameId];
        }
    });

    saveState();
    showToast('Overrides saved!');
}

function clearAllOverrides() {
    if (!confirm('Clear all overrides?')) return;
    state.overrides = {};
    saveState();
    const round = parseInt(document.getElementById('overrideRound').value);
    loadOverrideGames(round);
    showToast('All overrides cleared');
}

// ---- Danger Zone ----
function resetTransfers() {
    if (!confirm('Reset all transfers? Team control will revert to original draft assignments.')) return;
    state.transfers = [];
    state.teamControl = { ...state.originalDraft };
    saveState();
    renderTransferDropdowns();
    showToast('Transfers reset');
}

function resetAll() {
    if (!confirm('RESET EVERYTHING? This will clear all players, assignments, transfers, and overrides.')) return;
    if (!confirm('Are you absolutely sure?')) return;

    state.players = Array.from({length: NUM_PLAYERS}, (_, i) => ({ id: i, name: `Player ${i + 1}`, color: PLAYER_COLORS[i] }));
    state.teamControl = {};
    state.originalDraft = {};
    state.transfers = [];
    state.overrides = {};
    saveState();

    renderPlayerGrid();
    renderTeamGrid();
    renderTransferDropdowns();
    showToast('Everything has been reset');
}
