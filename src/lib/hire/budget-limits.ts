/**
 * What one hire may be funded with, in $U.
 *
 * Its own module so the request board can hold budgets and proposals to
 * the same limit as the hire they lead to without importing the hire
 * hook: a request priced above what a hire accepts is one that can be
 * chosen and then never funded.
 */
export const BUDGET_MIN = 0.01;
export const BUDGET_MAX = 5;
