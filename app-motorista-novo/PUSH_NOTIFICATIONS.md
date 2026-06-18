# Push — App Motorista Essência Logística

## Diagnóstico do bug (tela bloqueada)

O modal **"Novo serviço"** ao abrir o app vem do **polling a cada 5s** em `MotoristaContext` — não é push real. Com tela bloqueada o JavaScript do Expo Go é suspenso e o polling para.

Push real exige:

1. `Notifications.getExpoPushTokenAsync()` (já implementado — **não** usamos `scheduleNotificationAsync`)
2. Token salvo em `motoristas.push_token` via `POST /api/app/motorista/push-token`
3. Backend chamando `https://exp.host/--/api/v2/push/send` ao enviar serviço
4. **EAS projectId real** em `app.json` (`npx eas init`)
5. Para som customizado + confiabilidade total: **Development Build** (não Expo Go)

---

## Som de sirene — `ambulance_siren.wav`

| Item | Valor |
|------|-------|
| Arquivo | `assets/sounds/ambulance_siren.wav` |
| Duração | **20 segundos** (máximo configurado) |
| Plugin | `expo-notifications` em `app.json` |
| Payload backend | `"sound": "ambulance_siren.wav"` |
| Canal Android | `novo_servico` — `importance: MAX`, vibração longa, som customizado |

### Limitação iOS (importante)

No **iPhone com tela bloqueada**, o sistema iOS:

- toca o arquivo de som da notificação **uma vez** ao receber o push;
- **não permite** loop infinito nem repetir a sirene até o motorista abrir o app;
- aceita arquivos de até **30s** — usamos **20s** para máximo alerta permitido;
- o som customizado **só funciona** com o `.wav` no bundle do app → **Development Build** (não Expo Go).

Comportamento esperado (Development Build + push real):

1. Central envia serviço
2. iPhone bloqueado exibe **"Novo serviço recebido"**
3. Toca sirene (até 20s, uma reprodução)
4. Vibra
5. Motorista toca na notificação → app abre no serviço

---

## Expo Go vs Development Build

| Cenário | Expo Go | Development Build |
|---------|---------|-------------------|
| Push com app em background (iOS) | Pode funcionar com projectId real | Funciona |
| Push com tela bloqueada (iOS) | Pode funcionar com projectId real | Funciona |
| Push Android SDK 53+ | **Não suportado** no Expo Go | Funciona |
| Som `ambulance_siren.wav` (20s) no push | **Não** — som padrão do sistema | **Sim** |
| Vibração em background | Limitado | Completo |

**Conclusão:** O comportamento observado (só alerta ao abrir o app) é compatível com **falha de push** (token inválido/ausente, projectId fake, som customizado no payload) **e** com limitações do Expo Go. Para operação em produção, use **Development Build**.

---

## Passo 1 — EAS projectId (obrigatório)

O `projectId` em `app.json` deve ser do projeto Expo real, não um UUID inventado.

```bash
cd app-motorista-novo
npm install -g eas-cli
eas login
eas init
```

O `eas init` atualiza `app.json` → `extra.eas.projectId` automaticamente.

---

## Passo 2 — Logs no app (iPhone)

Após login, no Metro/console:

```
[PUSH] appOwnership: expo
[PUSH] expoGo: true
[PUSH] projectId: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
PUSH TOKEN: ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]
[PUSH] POST push-token status 200 { ok: true, ... }
[PUSH] token salvo no backend para motorista ...
```

Se `projectId: (AUSENTE)` ou `PUSH TOKEN: null` → push não funcionará.

---

## Passo 3 — Verificar token no backend

```bash
# Status do motorista
curl http://SEU_IP:8000/api/app/motorista/MOTORISTA_ID/push-status

# Ou no banco
SELECT id, nome, push_token, push_platform FROM motoristas WHERE login = 'Teste';
```

---

## Passo 4 — Teste de push (tela bloqueada)

1. Reinicie o backend (`app.py`) para carregar os novos logs.
2. Login no app: `Teste` / `123` / `ABC1234`.
3. Aceite notificações.
4. Confirme token salvo (passo 3).
5. **Bloqueie o iPhone.**
6. Dispare teste:

```bash
curl -X POST http://SEU_IP:8000/api/app/motorista/MOTORISTA_ID/push-test
```

No terminal do backend:

```
[PUSH] enviando para motorista ...
[PUSH] token ExponentPushToken[...]
[PUSH] protocolo TESTE
[PUSH] payload [...]
[PUSH] status 200
[PUSH] resposta {"data":[{"status":"ok","id":"..."}]}
```

Erros comuns na resposta Expo:

- `DeviceNotRegistered` — token expirado; app limpa token e re-registra no próximo login
- `InvalidCredentials` — credenciais APNs/FCM não configuradas (precisa dev build + credenciais EAS)
- `InvalidToken` — projectId incorreto ou token malformado

7. Envie serviço pela Central — mesmos logs com protocolo real.

---

## Passo 5 — Development Build (recomendado)

```bash
cd app-motorista-novo
eas build --profile development --platform ios
```

Após instalar o `.ipa` no iPhone (registro UDID / link interno EAS):

1. Abra o **app de desenvolvimento** (não Expo Go).
2. Login → confirme `PUSH TOKEN` nos logs.
3. O backend já envia `"sound": "ambulance_siren.wav"` por padrão (override opcional: `PUSH_SOUND` no `.env`).
4. Teste com tela bloqueada (passo 4).

### Credenciais iOS (push APNs)

Na primeira build iOS, o EAS pede credenciais Apple. Aceite gerar via EAS ou informe certificado APNs.

---

## Endpoints

| Método | Rota | Função |
|--------|------|--------|
| POST | `/api/app/motorista/push-token` | Salva token do app |
| GET | `/api/app/motorista/{id}/push-status` | Diagnóstico |
| POST | `/api/app/motorista/{id}/push-test` | Push de teste |
| POST | `/servicos/{id}/enviar` | Central envia → dispara push |

---

## Script auxiliar

```bash
cd app-motorista-novo
node scripts/test-push-token.mjs
```

Valida apenas o endpoint `push-token` (token fake). Para teste real use `push-test` com token real do app.
