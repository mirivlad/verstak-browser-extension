(function (root) {
  'use strict';

  var MAX_DNS_HOSTNAME_LENGTH = 253;
  var MAX_DNS_LABEL_LENGTH = 63;

  function trimmedString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeIPv4(value) {
    var parts = value.split('.');
    if (parts.length !== 4) return '';
    for (var i = 0; i < parts.length; i += 1) {
      if (!/^(0|[1-9][0-9]{0,2})$/.test(parts[i])) return '';
      if (Number(parts[i]) > 255) return '';
    }
    return parts.join('.');
  }

  function normalizeIPv6(value) {
    try {
      var parsed = new URL('http://[' + value + ']');
      var hostname = parsed.hostname;
      if (hostname[0] !== '[' || hostname[hostname.length - 1] !== ']') return '';
      return hostname.slice(1, -1).toLowerCase();
    } catch (_) {
      return '';
    }
  }

  function normalizeDNS(value) {
    var ascii;
    try {
      ascii = new URL('http://' + value).hostname.toLowerCase();
    } catch (_) {
      return '';
    }
    if (!ascii || ascii[0] === '[' || ascii.indexOf(':') !== -1) return '';
    if (ascii[ascii.length - 1] === '.') ascii = ascii.slice(0, -1);
    if (!ascii || ascii[ascii.length - 1] === '.' || ascii.length > MAX_DNS_HOSTNAME_LENGTH) return '';

    var labels = ascii.split('.');
    for (var i = 0; i < labels.length; i += 1) {
      if (labels[i].length === 0 || labels[i].length > MAX_DNS_LABEL_LENGTH) return '';
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(labels[i])) return '';
    }
    return ascii;
  }

  function normalizeHostnameV1(input) {
    var value = trimmedString(input);
    if (!value || /[\s\\/?#@]/.test(value)) return '';

    if (value[0] === '[' || value[value.length - 1] === ']') {
      if (value[0] !== '[' || value[value.length - 1] !== ']') return '';
      return normalizeIPv6(value.slice(1, -1));
    }
    if (value.indexOf(':') !== -1) return '';

    if (value[value.length - 1] === '.') value = value.slice(0, -1);
    if (!value || value[value.length - 1] === '.') return '';
    if (/^[0-9.]+$/.test(value)) return normalizeIPv4(value);
    return normalizeDNS(value);
  }

  function normalizeURLHostnameV1(input) {
    var value = trimmedString(input);
    if (!value) return '';
    try {
      var url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
      return normalizeHostnameV1(url.hostname);
    } catch (_) {
      return '';
    }
  }

  var api = {
    normalizeHostnameV1: normalizeHostnameV1,
    normalizeURLHostnameV1: normalizeURLHostnameV1
  };

  root.VerstakBrowser = Object.assign(root.VerstakBrowser || {}, api);
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
