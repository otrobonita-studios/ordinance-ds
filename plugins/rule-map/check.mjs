// The rule map names rules of the check. This check fails when a row names a rule that does not exist.
import { RULES } from '../../scripts/rules.mjs';
export function check({ plugin, readJson }) {
  const out = [];
  const ids = new Set(RULES.map((r) => r.id));
  for (const row of readJson(plugin.dir, 'rule-map.json').rows) {
    if (!row.rule || !row.does) out.push({ rule: 'rule-map', file: `${plugin.dir}/rule-map.json`, why: 'a row needs a rule and what Ordinance DS does' });
    for (const id of row.checks || []) if (!ids.has(id)) out.push({ rule: 'rule-map', file: `${plugin.dir}/rule-map.json`, why: `"${row.rule}" names the check ${id}, which does not exist` });
  }
  return out;
}
