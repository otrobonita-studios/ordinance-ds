// The pipeline template runs the three commands and uses no action from another project.
export function check({ plugin, read, exists }) {
  const out = [];
  const file = `${plugin.dir}/assets/github-actions.yml`;
  const yml = read(file).replace(/^\s*#.*$/gm, '');
  if (/^\s*-?\s*uses:/m.test(yml)) out.push({ rule: 'pipeline', file, why: 'a "uses:" line: the template runs commands only' });
  for (const cmd of ['node scripts/build.mjs', 'node scripts/check.mjs', 'node --test']) if (!yml.includes(cmd)) out.push({ rule: 'pipeline', file, why: `does not run "${cmd}"` });
  if (!/permissions:\s*\n\s*contents: read/.test(yml)) out.push({ rule: 'pipeline', file, why: 'must limit the permissions of the pipeline to reading' });
  // the pipeline that this folder itself uses is a copy of the template, so the two cannot drift apart
  const live = '.github/workflows/check.yml';
  if (exists(live) && read(live).replace(/\r\n/g, '\n') !== read(file).replace(/\r\n/g, '\n')) out.push({ rule: 'pipeline', file: live, why: `is not a copy of ${file}` });
  return out;
}
