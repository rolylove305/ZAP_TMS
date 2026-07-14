/* DEPRECATED — invite-only login was removed (open self-signup + 30-day trial).
   This file used to re-apply the invite gate (is_email_invited) on top of
   pw-login.js, overriding the login form. It is now intentionally a no-op so it
   can't override pw-login.js. Kept as an empty stub so any cached loader that
   still requests it does not 404. Auth now lives entirely in pw-login.js. */
(()=>{})();
