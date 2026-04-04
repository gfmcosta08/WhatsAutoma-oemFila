'use strict';

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

module.exports = { isNonEmptyString };
