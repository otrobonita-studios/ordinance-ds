// A test with a component framework: Base UI components take the Ordinance DS classes, and the stylesheet styles their states.
// Run it in this folder:  npm ci --ignore-scripts  and then  npm test
// The packages here are for this test only. They are not part of the site, and the build does not use them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Switch } from '@base-ui/react/switch';
import { Tabs } from '@base-ui/react/tabs';
import { Button } from '@base-ui/react/button';
import { Checkbox } from '@base-ui/react/checkbox';
import { Radio } from '@base-ui/react/radio';
import { RadioGroup } from '@base-ui/react/radio-group';

const css = readFileSync(new URL('../../dist/ordinance.css', import.meta.url), 'utf8');
const hasRule = (selector) => css.includes(selector);
const tagWith = (html, cls) => (new RegExp(`<[a-z]+[^>]*class="${cls}"[^>]*>`).exec(html) || [''])[0];

test('a Base UI switch takes the class, and shows its state with attributes that the stylesheet selects', () => {
  const on = renderToStaticMarkup(h(Switch.Root, { className: 'ord-switch', defaultChecked: true }, h(Switch.Thumb, { className: 'ord-switch__thumb' })));
  const off = renderToStaticMarkup(h(Switch.Root, { className: 'ord-switch', disabled: true }, h(Switch.Thumb, { className: 'ord-switch__thumb' })));
  assert.match(tagWith(on, 'ord-switch'), /data-checked=""/);
  assert.match(tagWith(on, 'ord-switch'), /role="switch"/);
  assert.match(tagWith(off, 'ord-switch'), /data-disabled=""/);
  assert.ok(hasRule('.ord-switch[data-checked]'), 'the stylesheet has a rule for a checked switch');
  assert.ok(hasRule('.ord-switch[data-checked] .ord-switch__thumb'), 'and for its thumb');
  assert.ok(hasRule('.ord-switch[data-disabled]'), 'and for a disabled switch');
});

test('Base UI tabs mark the chosen tab with aria-selected, which the stylesheet selects', () => {
  const html = renderToStaticMarkup(h(Tabs.Root, { defaultValue: 'a' },
    h(Tabs.List, { className: 'ord-tabs' }, h(Tabs.Tab, { value: 'a', className: 'ord-tabs__tab' }, 'A'), h(Tabs.Tab, { value: 'b', className: 'ord-tabs__tab' }, 'B')),
    h(Tabs.Panel, { value: 'a' }, 'Panel A')));
  const tabs = [...html.matchAll(/<button[^>]*class="ord-tabs__tab"[^>]*>/g)].map((m) => m[0]);
  assert.equal(tabs.length, 2);
  assert.match(tabs[0], /aria-selected="true"/);
  assert.match(tabs[1], /aria-selected="false"/);
  assert.ok(hasRule('.ord-tabs__tab[aria-selected="true"]'));
});

test('a Base UI checkbox and radio button show their state with data-checked, which the stylesheet selects', () => {
  const box = renderToStaticMarkup(h(Checkbox.Root, { className: 'ord-check', defaultChecked: true }));
  assert.match(tagWith(box, 'ord-check'), /data-checked=""/);
  assert.match(tagWith(box, 'ord-check'), /role="checkbox"/);
  assert.ok(hasRule('.ord-check[data-checked]') && hasRule('.ord-check[data-checked]::before'));
  const radio = renderToStaticMarkup(h(RadioGroup, { defaultValue: 'a' }, h(Radio.Root, { className: 'ord-radio', value: 'a' })));
  assert.match(tagWith(radio, 'ord-radio'), /data-checked=""/);
  assert.ok(hasRule('.ord-radio[data-checked]') && hasRule('.ord-radio[data-checked]::before'));
});

test('a disabled Base UI button is styled like a disabled plain button', () => {
  const html = renderToStaticMarkup(h(Button, { className: 'ord-button', disabled: true }, 'Save'));
  assert.match(html, /data-disabled=""/);
  assert.ok(hasRule('.ord-button[data-disabled]') && hasRule('.ord-button:disabled'));
});

// A fact to know, kept as a test so that a change in Base UI is seen: on the server, Base UI writes style attributes.
// The strict security policy blocks a style attribute, and the Ordinance DS check refuses one in a page. So under the strict
// policy, Base UI components are rendered in the browser, where styles are set through the DOM, which the policy allows.
test('Base UI writes style attributes when it renders on the server', () => {
  const html = renderToStaticMarkup(h(Switch.Root, { className: 'ord-switch' }, h(Switch.Thumb, { className: 'ord-switch__thumb' })));
  assert.match(html, /\sstyle="/);
});
