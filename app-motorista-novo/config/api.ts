/**
 * URL do backend local — use o IP da máquina na rede Wi-Fi (não localhost no celular).
 * Ajuste EXPO_PUBLIC_API_BASE em .env se o IP mudar.
 */
export const API_BASE =
  (process.env.EXPO_PUBLIC_API_BASE || 'http://192.168.0.97:8000').replace(/\/$/, '');

/** Logs temporários para testes de integração */
export const DEBUG_API = true;

export function debugLog(label: string, ...args: unknown[]) {
  if (DEBUG_API) {
    console.log(`[EssenciaMotorista/${label}]`, ...args);
  }
}

if (DEBUG_API) {
  console.log('[EssenciaMotorista/config] API_BASE =', API_BASE);
  console.log(
    '[EssenciaMotorista/config] EXPO_PUBLIC_API_BASE =',
    process.env.EXPO_PUBLIC_API_BASE ?? '(fallback)'
  );
}

export function formatFetchError(err: unknown): string {
  if (err instanceof Error) {
    const extra = (err as Error & { cause?: unknown }).cause;
    return extra ? `${err.name}: ${err.message} | cause: ${formatFetchError(extra)}` : `${err.name}: ${err.message}`;
  }
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
