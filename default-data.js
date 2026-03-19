/* ============================================
   DEFAULT LEAGUE DATA
   Baked-in player names and team assignments
   Used to seed Firebase on first run
   ============================================ */

const DEFAULT_PLAYERS = [
    { id: 0, name: 'Hove',  color: '#ff6b35' },
    { id: 1, name: 'Kyle',  color: '#448aff' },
    { id: 2, name: 'Curt',  color: '#00c853' },
    { id: 3, name: 'Jeff',  color: '#ff3d57' },
    { id: 4, name: 'Mac',   color: '#ffc107' },
    { id: 5, name: 'Doug',  color: '#b388ff' },
    { id: 6, name: 'Trey',  color: '#00bcd4' },
    { id: 7, name: 'Moose', color: '#ff80ab' }
];

// ESPN Team ID -> Player ID
// Built from the draft screenshot
const DEFAULT_DRAFT = {
    // === Hove (0) ===
    '47':     0,  // (16) Howard
    '62':     0,  // (13) Hawai'i
    '150':    0,  // (1) Duke
    '158':    0,  // (4) Nebraska
    '2116':   0,  // (10) UCF
    '2377':   0,  // (12) McNeese
    '2599':   0,  // (5) St. John's
    '2608':   0,  // (7) Saint Mary's

    // === Kyle (1) ===
    '41':     1,  // (2) UConn
    '275':    1,  // (5) Wisconsin
    '2006':   1,  // (12) Akron
    '2250':   1,  // (3) Gonzaga
    '2390':   1,  // (7) Miami
    '2541':   1,  // (10) Santa Clara
    '2634':   1,  // (15) Tennessee State
    '2653':   1,  // (13) Troy

    // === Curt (2) ===
    '57':     2,  // (1) Florida
    '58':     2,  // (11) South Florida
    '70':     2,  // (15) Idaho
    '96':     2,  // (7) Kentucky
    '153':    2,  // (6) UNC
    '356':    2,  // (3) Illinois
    '2275':   2,  // (13) Hofstra
    '2294':   2,  // (9) Iowa

    // === Jeff (3) ===
    '8':      3,  // (4) Arkansas
    '66':     3,  // (2) Iowa State
    '222':    3,  // (8) Villanova
    '245':    3,  // (10) Texas A&M
    '2449':   3,  // (14) North Dakota State
    '2460':   3,  // (12) Northern Iowa
    '2633':   3,  // (6) Tennessee
    '112358': 3,  // (16) LIU

    // === Mac (4) ===
    '12':     4,  // (1) Arizona
    '97':     4,  // (6) Louisville
    '194':    4,  // (8) Ohio State
    '231':    4,  // (15) Furman
    '251':    4,  // (11) Texas
    '258':    4,  // (3) Virginia
    '328':    4,  // (9) Utah State
    '338':    4,  // (14) Kennesaw State

    // === Doug (5) ===
    '61':     5,  // (8) Georgia
    '142':    5,  // (10) Missouri
    '248':    5,  // (2) Houston
    '252':    5,  // (6) BYU
    '333':    5,  // (4) Alabama
    '2561':   5,  // (16) Siena
    '2670':   5,  // (11) VCU
    '2750':   5,  // (14) Wright State

    // === Trey (6) ===
    '26':     6,  // (7) UCLA
    '127':    6,  // (3) Michigan State
    '130':    6,  // (1) Michigan
    '193':    6,  // (11) Miami (OH)
    '238':    6,  // (5) Vanderbilt
    '2511':   6,  // (15) Queens University
    '2628':   6,  // (9) TCU
    '2856':   6,  // (13) Cal Baptist

    // === Moose (7) ===
    '139':    7,  // (9) Saint Louis
    '219':    7,  // (14) Penn
    '228':    7,  // (8) Clemson
    '2272':   7,  // (12) High Point
    '2305':   7,  // (4) Kansas
    '2504':   7,  // (16) Prairie View A&M
    '2509':   7,  // (2) Purdue
    '2641':   7   // (5) Texas Tech
};
