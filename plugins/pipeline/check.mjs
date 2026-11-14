// The pipeline template runs commands only, keeps its token out of every address and every command, and is the same
// file as the pipeline that this folder itself uses.
export function check({ plugin, read, exists }) {
  const out = [];
  const file = `${plugin.dir}/assets/github-actions.yml`;
  const bad = (why, where = file) => out.push({ rule: 'pipeline', file: where, why });
  const yml = read(file).replace(/^\s*#.*$/gm, '');
  if (/^\s*-?\s*uses:/m.test(yml)) bad('a "uses:" line: the template runs commands only');
  for (const cmd of ['node scripts/build.mjs', 'node scripts/check.mjs', 'node --test', '--experimental-test-coverage', 'node scripts/browser-tests.mjs', 'node --check', 'node scripts/history-check.mjs', 'npm ci --ignore-scripts', 'npm audit', 'npm run lint']) if (!yml.includes(cmd)) bad(`does not run "${cmd}"`);
  if (!/permissions:\s*\n\s*contents: read/.test(yml)) bad('must limit the permissions of the pipeline to reading');
  // the token is a header for one command, never a part of an address that a log or a config file can keep
  if (/https?:\/\/[^\s"']*@/.test(yml) || /x-access-token:\$\{\{/.test(yml)) bad('a token in an address: send it as a header');
  // a value from the event reaches a step as an environment variable, and is never written into a command
  for (const line of yml.split('\n')) {
    if (!line.includes('${{')) continue;
    if (!/^\s*(?:[A-Z_]+|if):\s/.test(line)) bad(`a value from the event is written into a command: "${line.trim().slice(0, 60)}". Pass it as an environment variable.`);
  }
  if (/\bnpm (?:ci|install)\b(?!.*--ignore-scripts)/.test(yml)) bad('an install that runs the scripts of its packages: add --ignore-scripts');
  // the pipeline that this folder itself uses is a copy of the template, so the two cannot drift apart
  const live = '.github/workflows/check.yml';
  if (exists(live) && read(live).replace(/\r\n/g, '\n') !== read(file).replace(/\r\n/g, '\n')) bad(`is not a copy of ${file}`, live);
  return out;
}
