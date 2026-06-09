# XSDs NFS-e Nacional v1.01

Esquemas oficiais do layout DPS/NFS-e versão **1.01** (SEFIN Nacional).

## Fonte

1. **Oficial (preferencial):** [Documentação técnica NFS-e — gov.br](https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual)
   - Pacote: `NFSe-ESQUEMAS_XSD-v1.01-20260209.zip`
2. **Mirror (fallback):** repositório [pedrocasado/nfse-php](https://github.com/pedrocasado/nfse-php) — usado quando o download direto do gov.br retorna 403.

Para baixar/atualizar:

```bash
python scripts/download_nfse_xsd.py
```

## Arquivos principais

| Arquivo | Uso |
|---------|-----|
| `DPS_v1.01.xsd` | Validação do XML DPS (raiz) |
| `tiposComplexos_v1.01.xsd` | Tipos complexos (infDPS, trib, cServ…) |
| `tiposSimples_v1.01.xsd` | Tipos simples, patterns e enums |
| `xmldsig-core-schema.xsd` | Assinatura XML (`ds:Signature`) |

## Validação local

O módulo `nfse_nacional/schema_validator.py` valida o XML assinado **antes** do POST à SEFIN.

Compatibilidade **libxml2 (XSD 1.0):** o padrão `TSSerieDPS` no XSD oficial usa âncoras `^`/`$` (sintaxe XSD 1.1). Uma cópia em `.validation_cache/` normaliza apenas esse pattern para `0{0,4}[0-9]{1,5}` — equivalente semântico, sem alterar os XSDs versionados aqui.

Teste:

```bash
python scripts/test_nfse_schema.py
```
