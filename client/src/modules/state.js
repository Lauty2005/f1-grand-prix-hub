// Global application state — plain object, not reactive.
// Mutations do NOT auto-trigger re-renders; callers are responsible for
// calling the active view's loader after mutating (see refreshActiveView in main.js).
export const state = {
    currentYear: '2026',
    driversList: [],      // Shared with the driver modal for quick lookup
    currentStandingsTab: 'drivers'
};