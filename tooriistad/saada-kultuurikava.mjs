// Kultuurikava ei vasta välismaistele serveritele (GitHub), seepärast tõmbab selle Eesti arvuti
// ja saadab harusse „kultuurikava" (üks commit, surutakse üle → ajalugu ei kasva), siis käivitab avaldamise.
// Käivitab Windowsi ajastatud ülesanne „KUHU Kultuurikava" (06:00 ja 14:00).
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const JUUR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = k => execSync(`git ${k}`, { cwd: JUUR, encoding: 'utf8' }).trim();

execSync('node tooriistad/uuenda.mjs', { cwd: JUUR, stdio: 'inherit', env: { ...process.env, AINULT_KULTUURIKAVA: '1' } });
const toores = git('hash-object -w vahemalu/kk-toores.json');
const kohad = git('hash-object -w vahemalu/kk-kohad.json');
const puu = execSync('git mktree', { cwd: JUUR, encoding: 'utf8', input: `100644 blob ${toores}\tkk-toores.json\n100644 blob ${kohad}\tkk-kohad.json\n` }).trim();
const commit = git(`commit-tree ${puu} -m "Kultuurikava ${new Date().toISOString().slice(0, 16)}"`);
git(`push -f origin ${commit}:refs/heads/kultuurikava`);
execSync('gh workflow run uuenda.yml -R alari-Holaroof/kuhu', { cwd: JUUR, stdio: 'inherit' });
console.log('Saadetud GitHubi, avaldamine käivitub.');
