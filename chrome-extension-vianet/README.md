# Essência Exportador — Extensão Chrome (MVP)

Extensão para importar serviços da tela do **Vianet/Mondial** diretamente para o Sistema Essência Logística (FastAPI).

## O que faz

1. O operador abre um serviço no Vianet (`vianet.webmondial.com.br`).
2. Clica no ícone da extensão **Essência Exportador**.
3. Clica em **Capturar serviço** — a extensão lê os dados da página aberta.
4. Revisa o preview.
5. Clica em **Enviar para sistema** — POST para o backend local.

## Pré-requisitos

- Google Chrome
- Backend rodando localmente:

```bash
uvicorn app:app --host 0.0.0.0 --port 8000
```

## Instalar no Chrome (modo desenvolvedor)

1. Abra `chrome://extensions/`
2. Ative **Modo do desenvolvedor** (canto superior direito)
3. Clique em **Carregar sem compactação**
4. Selecione a pasta `chrome-extension-vianet` deste projeto
5. A extensão **Essência Exportador** aparecerá na barra

## Como usar

1. Faça login normalmente no Vianet/Mondial (a extensão **não** automatiza login)
2. Abra a tela de detalhe de um serviço/assistência
3. Clique no ícone da extensão
4. **Capturar serviço** → confira o preview
5. **Enviar para sistema**
6. Abra `http://localhost:8000/central` e confirme o serviço importado

## Endpoint utilizado

```
POST http://localhost:8000/api/importar/vianet
Content-Type: application/json
```

### Resposta de sucesso

```json
{
  "ok": true,
  "id": "uuid-do-servico",
  "protocolo": "123456",
  "mensagem": "Serviço importado com sucesso."
}
```

### Serviço duplicado

```json
{
  "ok": false,
  "erro": "serviço já cadastrado",
  "id": "...",
  "protocolo": "123456"
}
```

## Campos capturados

Protocolo, seguradora/produto, tipo de serviço, origem/destino (com bairro, cidade, CEP etc.), segurado, solicitante, telefone, veículo, placa, problema, aceito em, prazo, entre outros.

Campos não encontrados na página são enviados vazios.

## Teste rápido (sem Vianet)

Com o backend rodando, envie um JSON manual:

```bash
curl -X POST http://localhost:8000/api/importar/vianet \
  -H "Content-Type: application/json" \
  -d "{\"protocolo\":\"TEST-001\",\"seguradora\":\"Mondial\",\"servico\":\"REBOQUE LEVE\",\"local_origem\":\"Rua A, 100\",\"cidade_origem\":\"São Paulo\",\"local_destino\":\"Rua B, 200\",\"cidade_destino\":\"Guarulhos\",\"placa\":\"ABC1D23\",\"segurado\":\"João Silva\",\"telefone\":\"11999999999\"}"
```

## Recarregar após atualização

1. `chrome://extensions/` → **Recarregar** na extensão
2. **Feche e reabra** a aba do Vianet (ou F5 em todas as frames)
3. Abra o serviço e capture novamente
4. Use **Ver debug** para inspecionar frames, inputs e texto bruto

## Limitações do MVP

- Layout HTML do Vianet pode mudar — use **Ver debug** no popup para inspecionar pares label/valor capturados
- Funciona apenas na aba ativa do domínio `vianet.webmondial.com.br`
- Backend padrão: `localhost:8000` (editável no popup)
- Sem autenticação na API (uso interno/local)
- Não acessa dados fora da página aberta
- Tipo de serviço pode precisar ajuste manual no faturamento se não bater com a tabela de preços

## Estrutura

```
chrome-extension-vianet/
├── manifest.json
├── popup.html
├── popup.js
├── content.js
└── README.md
```
