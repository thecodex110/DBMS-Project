'use strict';
// Logged-in user for the current run (set by app.js after login)
let current = null;

module.exports = {
  set(user) { current = user; },
  get user() { return current; },
  isAdmin() { return !!current && current.role === 'admin'; },
  facultyId() { return current ? current.facultyId : null; },
};
