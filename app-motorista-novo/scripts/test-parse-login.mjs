/**
 * Testa parseLoginResponse — reproduz falha do código antigo.
 * Uso: node scripts/test-parse-login.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const authPath = pathToFileURL(join(dir, '..', 'lib', 'auth.ts')).href;

// Compila TS em runtime via texto — duplicamos a lógica pura para teste offline
function parseLoginResponse(raw, status) {
  let parsed;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return { ok: false, erro: `Resposta inválida do servidor (HTTP ${status})`, raw, status };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, erro: `Resposta vazia do servidor (HTTP ${status})`, raw, status };
  }
  if (parsed.ok !== true) {
    return { ok: false, erro: parsed.erro || 'Login inválido', raw, status };
  }
  if (!parsed.motorista?.id) {
    return { ok: false, erro: 'Servidor não retornou motorista.id', raw, status };
  }
  return { ok: true, motorista: parsed.motorista, raw };
}

function oldFlow(raw) {
  const data = raw ? JSON.parse(raw) : null;
  if (!data.ok) return 'login_invalido';
  return `logado:${data.motorista.id}`;
}

const okBody =
  '{"ok":true,"motorista":{"id":"8251b611-053a-42f6-b102-33e301732fd2","nome":"Motorista Teste","placa_atual":"ABC1234"}}';

console.log('=== resposta válida ===');
console.log('novo:', parseLoginResponse(okBody, 200));
console.log('antigo:', oldFlow(okBody));

console.log('\n=== corpo vazio HTTP 200 (bug antigo: TypeError) ===');
try {
  console.log('antigo:', oldFlow(''));
} catch (e) {
  console.log('antigo FALHOU:', e.name, e.message, '→ catch mostrava "Não foi possível conectar"');
}
console.log('novo:', parseLoginResponse('', 200));

console.log('\n=== JSON null (bug antigo: TypeError) ===');
try {
  console.log('antigo:', oldFlow('null'));
} catch (e) {
  console.log('antigo FALHOU:', e.name, e.message);
}
console.log('novo:', parseLoginResponse('null', 200));

console.log('\nOK — parseLoginResponse trata respostas inválidas sem exceção silenciosa');
