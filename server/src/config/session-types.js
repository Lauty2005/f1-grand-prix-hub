// Canonical session type identifiers used across routes, controllers, services, and frontend.
// Always reference these constants instead of raw strings to prevent silent typo bugs.

export const SESSION = Object.freeze({
    RACE:              'results',
    QUALIFYING:        'qualifying',
    SPRINT:            'sprint',
    SPRINT_QUALIFYING: 'sprint-qualifying',
    PRACTICES:         'practices',
});

// Maps a session key to its database table name.
export const SESSION_TABLE = Object.freeze({
    [SESSION.RACE]:              'results',
    [SESSION.QUALIFYING]:        'qualifying',
    [SESSION.SPRINT]:            'sprint_results',
    [SESSION.SPRINT_QUALIFYING]: 'sprint_qualifying',
    [SESSION.PRACTICES]:         'practices',
});

// Human-readable labels for each session type (used in admin UI / error messages).
export const SESSION_LABEL = Object.freeze({
    [SESSION.RACE]:              'Carrera Principal',
    [SESSION.QUALIFYING]:        'Clasificación',
    [SESSION.SPRINT]:            'Sprint',
    [SESSION.SPRINT_QUALIFYING]: 'Sprint Qualifying',
    [SESSION.PRACTICES]:         'Prácticas',
});

export const ALL_SESSIONS = Object.values(SESSION);
