/* Roda todas as suítes e resume o resultado.
 *   node testes\run.js
 * Sai com código 1 se qualquer asserção falhar — serve para uso em hook ou CI. */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const suites = fs.readdirSync(__dirname)
  .filter(f => /^t\d+\.js$/.test(f))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

let totalPass = 0, totalFalha = 0;
const quebradas = [];

for (const s of suites) {
  let saida = '';
  try {
    saida = execFileSync(process.execPath, [path.join(__dirname, s)], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    saida = (e.stdout || '') + (e.stderr || '');
  }
  const pass = (saida.match(/^PASS/gm) || []).length;
  const falha = (saida.match(/^FALHA/gm) || []).length;
  totalPass += pass;
  totalFalha += falha;

  // descrição = o que vem depois do travessão na primeira linha do cabeçalho da suíte
  const cabecalho = fs.readFileSync(path.join(__dirname, s), 'utf8').split('\n')[0];
  const desc = ((cabecalho.match(/—\s*(.+?)\s*\.?$/) || [])[1] || '').trim();
  console.log(`${s.padEnd(8)} ${String(pass).padStart(3)} PASS  ${String(falha).padStart(2)} FALHA   ${desc}`);
  if (falha) {
    quebradas.push(s);
    (saida.match(/^FALHA.*$/gm) || []).forEach(l => console.log('   ' + l));
  }
}

console.log('-'.repeat(60));
console.log(`TOTAL: ${totalPass} PASS / ${totalFalha} FALHA em ${suites.length} suítes`);
if (quebradas.length) {
  console.log('Suítes com falha: ' + quebradas.join(', '));
  process.exit(1);
}
