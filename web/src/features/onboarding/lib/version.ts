/**
 * Bump to show the tour again to everybody who saw an older one. Positive and at most 32767 (the api
 * stores a smallint). React-free on purpose: the e2e setup imports it to mark the tour as seen.
 */
export const TOUR_VERSION = 1;
