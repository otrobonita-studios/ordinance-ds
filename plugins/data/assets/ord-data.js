/* ord-data.js: the one way a page of Ordinance DS gets data. Data is checked against a schema before a page shows it,
   and it is written into the page as text, never as HTML.
     ordData.read(id, schema)     reads a JSON block of the page: <script type="application/json" id="...">
     ordData.load(path, schema)   asks the site's own server. It refuses every other address.
     ordData.table(box, table)    writes a table from checked data
   Schema forms: { type: 'string', max } { type: 'number', min, max } { type: 'boolean' }
                 { type: 'array', items, max } { type: 'object', props: { key: schema } }, each with optional: true */
(function (root) {
  'use strict';
  const LIMITS = { characters: 262144, string: 400, list: 2000 };

  function DataError(path, why) {
    this.name = 'DataError';
    this.path = path;
    this.message = (path || 'data') + ' ' + why;
  }
  DataError.prototype = Object.create(Error.prototype);

  function validate(value, schema, path) {
    path = path || '';
    if (value === undefined || value === null) {
      if (schema.optional) return undefined;
      throw new DataError(path, 'is missing');
    }
    if (schema.type === 'string') {
      if (typeof value !== 'string') throw new DataError(path, 'must be a text');
      if (value.length > Math.min(schema.max || LIMITS.string, LIMITS.string * 10)) throw new DataError(path, 'is too long');
      return value;
    }
    if (schema.type === 'number') {
      if (typeof value !== 'number' || !isFinite(value)) throw new DataError(path, 'must be a number');
      if (schema.min !== undefined && value < schema.min) throw new DataError(path, 'must be at least ' + schema.min);
      if (schema.max !== undefined && value > schema.max) throw new DataError(path, 'must be at most ' + schema.max);
      return value;
    }
    if (schema.type === 'boolean') {
      if (typeof value !== 'boolean') throw new DataError(path, 'must be true or false');
      return value;
    }
    if (schema.type === 'array') {
      if (!Array.isArray(value)) throw new DataError(path, 'must be a list');
      if (value.length > Math.min(schema.max || LIMITS.list, LIMITS.list)) throw new DataError(path, 'has too many items');
      return value.map(function (v, i) { return validate(v, schema.items, path + '[' + i + ']'); });
    }
    if (schema.type === 'object') {
      if (typeof value !== 'object' || Array.isArray(value)) throw new DataError(path, 'must be an object');
      const out = {};
      Object.keys(schema.props).forEach(function (key) {
        const v = validate(value[key], schema.props[key], path ? path + '.' + key : key);
        if (v !== undefined) out[key] = v;
      });
      return out; // a key that the schema does not name is left out
    }
    throw new DataError(path, 'has a schema of an unknown type');
  }

  function parse(text, schema) {
    if (typeof text !== 'string' || text.length > LIMITS.characters) throw new DataError('', 'is too large');
    let raw;
    try { raw = JSON.parse(text); } catch (e) { throw new DataError('', 'is not valid JSON'); }
    return validate(raw, schema);
  }

  function read(id, schema, doc) {
    const el = (doc || root.document).getElementById(id);
    if (!el) throw new DataError(id, 'is not on the page');
    if (el.tagName !== 'SCRIPT' || el.getAttribute('type') !== 'application/json') throw new DataError(id, 'must be a JSON block');
    return parse(el.textContent, schema);
  }

  /* The one place in Ordinance DS that asks a server. The address must be on the site's own origin. */
  function load(path, schema) {
    let url;
    try { url = new URL(path, root.location.href); } catch (e) { return Promise.reject(new DataError(String(path), 'is not an address')); }
    if (url.origin !== root.location.origin) return Promise.reject(new DataError(String(path), 'is on another server, and is refused'));
    return root.fetch(url.href, { credentials: 'same-origin', redirect: 'error', headers: { Accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new DataError(url.pathname, 'was answered with the status ' + res.status);
        return res.text();
      })
      .then(function (text) { return parse(text, schema); });
  }

  /* A table from checked data: { caption, columns: [{ key, label, numeric }], rows }. Every text is set as text. */
  function table(box, spec) {
    const doc = box.ownerDocument;
    const make = function (tag, text, cls) { const n = doc.createElement(tag); if (text !== undefined) n.textContent = String(text); if (cls) n.className = cls; return n; };
    const t = make('table', undefined, 'ord-table');
    t.appendChild(make('caption', spec.caption));
    const head = doc.createElement('tr');
    spec.columns.forEach(function (c) { const th = make('th', c.label, c.numeric ? 'ord-table__num' : ''); th.setAttribute('scope', 'col'); head.appendChild(th); });
    const thead = doc.createElement('thead'); thead.appendChild(head); t.appendChild(thead);
    const body = doc.createElement('tbody');
    spec.rows.forEach(function (r) {
      const tr = doc.createElement('tr');
      spec.columns.forEach(function (c, i) {
        const cell = make(i === 0 ? 'th' : 'td', r[c.key], c.numeric ? 'ord-table__num' : '');
        if (i === 0) cell.setAttribute('scope', 'row');
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
    t.appendChild(body);
    const scroll = make('div', undefined, 'ord-table-scroll');
    scroll.appendChild(t);
    box.replaceChildren(scroll);
    return t;
  }

  root.ordData = { validate: validate, parse: parse, read: read, load: load, table: table, DataError: DataError, LIMITS: LIMITS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
