"""Trava de segurança para emissão NFS-e Nacional em produção (somente controle operacional)."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

CONFIRMACAO_OBRIGATORIA = "EMITIR PRODUCAO"
LOG_PATH = Path(__file__).resolve().parents[1] / "debug" / "confirmacao_emissao_producao.txt"


def is_producao(config: dict | None) -> bool:
    return (config or {}).get("ambiente", "homologacao").lower() == "producao"


def montar_resumo_emissao(config: dict, nota: dict) -> dict:
    """Resumo fiscal/operacional exibido antes do POST em produção (não altera DPS)."""
    from nfse_nacional.ids import gerar_id_dps, ndps_deterministico, pad_ndps, pad_serie, so_digitos

    c_mun = so_digitos(config.get("codigo_ibge_municipio")).zfill(7)[-7:]
    cnpj = so_digitos(config.get("cnpj"))
    serie = pad_serie(nota.get("serie_rps") or "1")
    n_dps = pad_ndps(ndps_deterministico(nota.get("id"), nota.get("numero_rps")))
    id_dps = gerar_id_dps(c_mun, cnpj, serie, n_dps) if c_mun and len(cnpj) == 14 else ""

    tomador_doc = so_digitos(nota.get("cliente_cnpj_cpf") or "")
    valor = nota.get("total_nota") or nota.get("total_servicos") or 0

    return {
        "nota_id": str(nota.get("id") or ""),
        "numero_rps": nota.get("numero_rps") or "",
        "cnpj_prestador": cnpj,
        "im_prestador": config.get("inscricao_municipal") or "",
        "razao_social": config.get("razao_social") or "",
        "tomador_nome": nota.get("cliente_nome") or "",
        "tomador_doc": tomador_doc,
        "valor_nota": float(valor or 0),
        "serie": serie,
        "serie_rps": nota.get("serie_rps") or "1",
        "nDPS": n_dps.lstrip("0") or "1",
        "nDPS_padded": n_dps,
        "infDPS_Id_previsto": id_dps,
        "ambiente": "producao",
        "ambiente_label": "Produção",
        "endpoint_sefin": "https://sefin.nfse.gov.br/SefinNacional/nfse",
        "aviso_validade_fiscal": (
            "ATENÇÃO: esta nota terá validade fiscal real perante a SEFIN Nacional."
        ),
        "confirmacao_obrigatoria": CONFIRMACAO_OBRIGATORIA,
    }


def exigir_confirmacao_producao(config: dict, confirmacao: str | None) -> None:
    if not is_producao(config):
        return
    if (confirmacao or "").strip() != CONFIRMACAO_OBRIGATORIA:
        raise ValueError(
            f"Emissão em PRODUÇÃO bloqueada. Digite exatamente: {CONFIRMACAO_OBRIGATORIA}"
        )


def bloquear_emissao_lote_producao(config: dict) -> None:
    if is_producao(config):
        raise ValueError(
            "Emissão em lote não permitida em PRODUÇÃO. Emita uma nota por vez com confirmação."
        )


def registrar_log(evento: str, dados: dict) -> str:
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds")
    linhas = [
        "==================================",
        f"[{ts}] {evento}",
        "==================================",
    ]
    for k, v in dados.items():
        if isinstance(v, dict):
            linhas.append(f"{k}:")
            for sk, sv in v.items():
                linhas.append(f"  {sk}: {sv}")
        elif isinstance(v, list):
            linhas.append(f"{k}: {v}")
        else:
            linhas.append(f"{k}: {v}")
    linhas.append("")
    texto = "\n".join(linhas)
    with LOG_PATH.open("a", encoding="utf-8") as f:
        f.write(texto + "\n")
    return str(LOG_PATH.resolve())


def formatar_resumo_texto(resumo: dict) -> str:
    return "\n".join(
        [
            f"CNPJ prestador: {resumo.get('cnpj_prestador')}",
            f"IM: {resumo.get('im_prestador') or '(não informada)'}",
            f"Tomador: {resumo.get('tomador_nome')} ({resumo.get('tomador_doc')})",
            f"Valor: R$ {resumo.get('valor_nota', 0):.2f}",
            f"Série: {resumo.get('serie_rps')} (Id: {resumo.get('serie')})",
            f"nDPS: {resumo.get('nDPS')}",
            f"infDPS.Id previsto: {resumo.get('infDPS_Id_previsto')}",
            f"Ambiente: {resumo.get('ambiente_label')}",
            f"Endpoint: {resumo.get('endpoint_sefin')}",
            resumo.get("aviso_validade_fiscal", ""),
        ]
    )
