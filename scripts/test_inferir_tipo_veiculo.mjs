/** Teste rápido inferirTipoVeiculo — node scripts/test_inferir_tipo_veiculo.mjs */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tsPath = path.join(__dirname, '..', 'app-motorista-novo', 'lib', 'checklist_avarias.ts');

// Duplicar lógica mínima para teste sem compilar TS
function normalizarTextoTipo(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[—–\-_/|\.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferirTipoVeiculo(...fontes) {
  const partes = fontes.filter(Boolean).map((f) => (typeof f === 'string' ? f : f.tipo || f.tipo_servico || ''));
  const t = normalizarTextoTipo(partes.join(' '));
  if (/\bEXTRA\s+PESAD|\bPESAD(O|S)\b|CAMINHAO|PRANCHAO|R\s*E\s*PES|R\s*L\s*PES|REBOQUE\s+PES/.test(t)) return 'pesado';
  if (/\bMOTO(CICLETA)?S?\b/.test(t)) return 'moto';
  if (/UTILIT|\bSUV\b|\bVAN\b|PICK\s*UP|PICKUP/.test(t)) return 'utilitario';
  if (/\bLEVE\b|C\s*MEC|AUTOMOVEL|REBOQUE\s*LEVE|\bPATIN/.test(t)) return 'leve';
  if (/\bPES\b/.test(t)) return 'pesado';
  return 'leve';
}

const casos = [
  ['REBOQUE — EXTRA PESADO', 'pesado'],
  ['R. E. PESADO', 'pesado'],
  ['C. MEC. LEVE', 'leve'],
  ['MOTO', 'moto'],
  ['MOTOCICLETA', 'moto'],
  ['UTILITÁRIO / VAN', 'utilitario'],
  ['PICK-UP', 'utilitario'],
  ['PATINS', 'leve'],
  ['REBOQUE LEVE', 'leve'],
];

let ok = 0;
for (const [entrada, esperado] of casos) {
  const got = inferirTipoVeiculo(entrada);
  const pass = got === esperado;
  console.log(`${pass ? 'OK' : 'FALHA'}: "${entrada}" => ${got} (esperado ${esperado})`);
  if (pass) ok++;
}
if (ok !== casos.length) process.exit(1);
console.log(`\n${ok}/${casos.length} casos OK`);
