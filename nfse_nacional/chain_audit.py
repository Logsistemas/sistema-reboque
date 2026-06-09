"""Auditoria da cadeia ICP-Brasil — PFX vs repositorios Windows (diagnostico E0714)."""
from __future__ import annotations

import json
import re
import subprocess
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.serialization import pkcs12

from nfse_nacional.signer import extrair_cnpj_certificado

DEBUG_DIR = Path(__file__).resolve().parents[1] / "debug"
DEBUG_RELATORIO = DEBUG_DIR / "auditoria_cadeia_icp.txt"

WINDOWS_STORES = (
    ("CurrentUser", "My", r"Cert:\CurrentUser\My"),
    ("LocalMachine", "My", r"Cert:\LocalMachine\My"),
    ("CurrentUser", "CA", r"Cert:\CurrentUser\CA"),
    ("LocalMachine", "CA", r"Cert:\LocalMachine\CA"),
    ("CurrentUser", "Root", r"Cert:\CurrentUser\Root"),
    ("LocalMachine", "Root", r"Cert:\LocalMachine\Root"),
)

ICP_ROOT_HINTS = (
    "AC RAIZ BRASILEIRA",
    "AUTORIDADE CERTIFICADORA RAIZ BRASILEIRA",
    "ICP-BRASIL",
)


def _fmt_dt(dt) -> str:
    if dt is None:
        return "(ausente)"
    if hasattr(dt, "astimezone"):
        return dt.astimezone(ZoneInfo("America/Sao_Paulo")).isoformat(timespec="seconds")
    return str(dt)


def _cn_dn(dn: str) -> str:
    m = re.search(r"CN=([^,]+)", dn or "", re.I)
    return m.group(1).strip() if m else (dn or "").strip()


def _norm_dn(dn: str) -> str:
    return re.sub(r"\s+", " ", (dn or "").upper().strip())


def _resumo_cert(cert: x509.Certificate, rotulo: str = "") -> dict:
    return {
        "rotulo": rotulo,
        "subject": cert.subject.rfc4514_string(),
        "subject_cn": _cn_dn(cert.subject.rfc4514_string()),
        "issuer": cert.issuer.rfc4514_string(),
        "issuer_cn": _cn_dn(cert.issuer.rfc4514_string()),
        "serial": str(cert.serial_number),
        "not_before": cert.not_valid_before_utc,
        "not_after": cert.not_valid_after_utc,
        "sha256": cert.fingerprint(hashes.SHA256()).hex(),
        "is_self_signed": _norm_dn(cert.subject.rfc4514_string()) == _norm_dn(
            cert.issuer.rfc4514_string()
        ),
    }


def _carregar_pfx(pfx_path: str, senha: str) -> tuple:
    with open(pfx_path, "rb") as f:
        data = f.read()
    pwd = senha.encode() if senha else None
    private_key, cert, chain = pkcs12.load_key_and_certificates(data, pwd)
    if not cert:
        raise ValueError("PFX sem certificado principal")
    return private_key, cert, list(chain or [])


def _powershell_listar_certificados() -> list[dict]:
    """Enumera certificados nos repositorios Windows via script PowerShell dedicado."""
    import tempfile

    stores_lines = "\n".join(
        f'@{{ scope="{s[0]}"; name="{s[1]}"; path="{s[2]}" }}'
        for s in WINDOWS_STORES
    )
    ps_script = textwrap.dedent(
        f"""
        $stores = @(
        {stores_lines}
        )
        $out = @()
        foreach ($st in $stores) {{
          try {{
            Get-ChildItem -Path $st.path -ErrorAction Stop | ForEach-Object {{
              $out += [PSCustomObject]@{{
                scope = $st.scope
                store = $st.name
                store_path = $st.path
                subject = $_.Subject
                issuer = $_.Issuer
                thumbprint = $_.Thumbprint
                not_after = $_.NotAfter.ToString('o')
                has_private_key = $_.HasPrivateKey
              }}
            }}
          }} catch {{ }}
        }}
        if ($null -eq $out -or $out.Count -eq 0) {{
          '[]'
        }} else {{
          $out | ConvertTo-Json -Compress -Depth 4
        }}
        """
    )
    ps_path = ""
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".ps1", delete=False, encoding="utf-8"
        ) as tmp:
            tmp.write(ps_script)
            ps_path = tmp.name
        proc = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                ps_path,
            ],
            capture_output=True,
            timeout=120,
        )
    except FileNotFoundError:
        return []
    finally:
        if ps_path:
            try:
                Path(ps_path).unlink(missing_ok=True)
            except Exception:
                pass

    raw = (proc.stdout or b"").decode("utf-8", errors="replace").strip()
    if proc.returncode != 0 or not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    if isinstance(data, dict):
        return [data]
    return list(data)


def _buscar_por_cn(candidatos: list[dict], cn: str) -> list[dict]:
    alvo = (cn or "").upper()
    hits = []
    for item in candidatos:
        subj_cn = _cn_dn(item.get("subject", "")).upper()
        if subj_cn == alvo or alvo in (item.get("subject") or "").upper():
            hits.append(item)
    return hits


def _buscar_por_thumbprint(candidatos: list[dict], thumb: str) -> dict | None:
    alvo = (thumb or "").replace(" ", "").upper()
    for item in candidatos:
        if (item.get("thumbprint") or "").replace(" ", "").upper() == alvo:
            return item
    return None


def _is_raiz_icp(subject_cn: str, cert_item: dict) -> bool:
    subj = (subject_cn or "").upper()
    if "RAIZ BRASILEIRA" in subj or "AC RAIZ" in subj:
        return True
    if _norm_dn(cert_item.get("subject", "")) == _norm_dn(cert_item.get("issuer", "")):
        return True
    return False


def _montar_cadeia_esperada(leaf: x509.Certificate, win_certs: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    Percorre emissores a partir do leaf ate raiz ICP-Brasil.
    Retorna (elos_encontrados_windows, elos_ausentes_windows).
    """
    encontrados: list[dict] = []
    ausentes: list[dict] = []
    issuer_cn = _cn_dn(leaf.issuer.rfc4514_string())
    issuer_dn = leaf.issuer.rfc4514_string()
    visitados: set[str] = set()

    for _ in range(8):
        chave = _norm_dn(issuer_dn)
        if not issuer_cn or chave in visitados:
            break
        visitados.add(chave)

        hits = _buscar_por_cn(win_certs, issuer_cn)
        # Preferir match exato de issuer DN quando houver multiplos CNs iguais
        escolhido = None
        for hit in hits:
            if _norm_dn(hit.get("subject", "")) == _norm_dn(issuer_dn):
                escolhido = hit
                break
        if escolhido is None and hits:
            escolhido = hits[0]

        if escolhido:
            subj_cn = _cn_dn(escolhido.get("subject", ""))
            papel = "raiz" if _is_raiz_icp(subj_cn, escolhido) else "intermediario"
            encontrados.append(
                {
                    "nivel": len(encontrados) + 1,
                    "papel": papel,
                    "subject_cn": subj_cn,
                    "subject": escolhido.get("subject", ""),
                    "issuer": escolhido.get("issuer", ""),
                    "thumbprint": escolhido.get("thumbprint", ""),
                    "store": f"{escolhido.get('scope')}\\{escolhido.get('store')}",
                    "store_path": escolhido.get("store_path", ""),
                    "not_after": escolhido.get("not_after", ""),
                }
            )
            if papel == "raiz":
                break
            issuer_cn = _cn_dn(escolhido.get("issuer", ""))
            issuer_dn = escolhido.get("issuer", "")
        else:
            ausentes.append(
                {
                    "nivel": len(encontrados) + len(ausentes) + 1,
                    "subject_cn_buscado": issuer_cn,
                    "issuer_dn_buscado": issuer_dn,
                    "motivo": "Nao encontrado nos repositorios Windows auditados",
                }
            )
            break

    return encontrados, ausentes


def _cadeia_no_pfx(chain: list[x509.Certificate]) -> list[dict]:
    return [_resumo_cert(c, f"pfx_inter_{i + 1}") for i, c in enumerate(chain)]


def _intermediarios_esperados_pfx(cadeia_esperada: list[dict]) -> list[str]:
    """Intermediarios que deveriam entrar no PFX (exclui raiz autoassinada)."""
    out = []
    for elo in cadeia_esperada:
        if elo.get("papel") == "raiz":
            continue
        cn = elo.get("subject_cn") or _cn_dn(elo.get("subject", ""))
        if cn:
            out.append(cn)
    return out


def _intermediarios_no_pfx(chain: list[x509.Certificate]) -> list[str]:
    return [_cn_dn(c.subject.rfc4514_string()) for c in chain]


def _faltantes_pfx(esperados: list[str], presentes: list[str]) -> list[str]:
    esp = {_cn_dn(x).upper() for x in esperados}
    pres = {_cn_dn(x).upper() for x in presentes}
    return [x for x in esperados if _cn_dn(x).upper() not in pres]


def _instrucoes_exportacao(
    leaf_cn: str,
    emissor_cn: str,
    faltantes: list[str],
    pfx_path: str,
    leaf_win: dict | None = None,
) -> list[str]:
    linhas = [
        "=== OPCAO A: Exportar novo PFX com cadeia completa (Windows) ===",
        "",
        "1. Abra certmgr.msc (Win+R -> certmgr.msc).",
        "2. Va em: Pessoal -> Certificados.",
        f"3. Localize o certificado: {leaf_cn}",
        f"   (emissor esperado: {emissor_cn})",
        "4. Clique direito -> Todas as tarefas -> Exportar...",
        "5. Escolha: Sim, exportar a chave privada.",
        "6. Marque: Incluir todos os certificados no caminho de certificacao, se possivel.",
        "7. Marque: Exportar extensoes de propriedade.",
        "8. Defina senha forte e salve como novo arquivo .pfx.",
        "9. Substitua manualmente o arquivo configurado no sistema:",
        f"   {pfx_path}",
        "10. Rode novamente: python scripts/auditar_cadeia_icp.py",
        "",
    ]
    if faltantes:
        linhas.append("Certificados intermediarios que precisam constar no PFX:")
        for f in faltantes:
            linhas.append(f"  - {f}")
        linhas.append("")
    linhas.extend(
        [
            "PowerShell alternativo (exportar do repositorio CurrentUser\\My):",
            "",
        ]
    )
    if leaf_win and leaf_win.get("thumbprint"):
        tp = leaf_win["thumbprint"]
        store_path = leaf_win.get("store_path") or r"Cert:\CurrentUser\My"
        linhas.extend(
            [
                f"  # Certificado correto identificado (thumbprint {tp}):",
                f"  $pwd = ConvertTo-SecureString -String 'SUA_SENHA' -Force -AsPlainText",
                f"  Export-PfxCertificate -Cert '{store_path}\\{tp}' `",
                f"    -FilePath 'C:\\temp\\ez_logistica_com_cadeia.pfx' -Password $pwd",
                "",
                "Nota: Export-PfxCertificate inclui a cadeia disponivel no Windows.",
            ]
        )
    else:
        linhas.extend(
            [
                "  # Localize o thumbprint:",
                f"  Get-ChildItem Cert:\\CurrentUser\\My | Where-Object {{ $_.Issuer -like '*SAFEWEB*' -and $_.Subject -like '*{leaf_cn[:30]}*' }}",
                "",
                "  # Exporte com cadeia (substitua THUMBPRINT e caminhos):",
                "  $pwd = ConvertTo-SecureString -String 'SUA_SENHA' -Force -AsPlainText",
                "  Export-PfxCertificate -Cert Cert:\\CurrentUser\\My\\THUMBPRINT `",
                "    -FilePath 'C:\\temp\\ez_logistica_com_cadeia.pfx' -Password $pwd",
                "",
                "Nota: Export-PfxCertificate inclui a cadeia disponivel no Windows.",
            ]
        )
    return linhas


def _instrucoes_reconstruir(
    faltantes: list[str],
    cadeia_encontrada: list[dict],
    pfx_path: str,
) -> list[str]:
    linhas = [
        "",
        "=== OPCAO B: Reconstruir PFX manualmente (leaf + chave + intermediarios) ===",
        "",
        "Pre-requisito: intermediarios localizados nos repositorios Windows (secao acima).",
        "",
        "Passos com OpenSSL (nao executar automaticamente — apenas referencia):",
        "",
        "  # 1) Extrair leaf e chave do PFX atual",
        f"  openssl pkcs12 -in \"{pfx_path}\" -nocerts -nodes -out ez_chave.pem",
        f"  openssl pkcs12 -in \"{pfx_path}\" -clcerts -nokeys -out ez_leaf.pem",
        "",
        "  # 2) Exportar cada intermediario ausente do Windows (exemplo PowerShell):",
    ]
    for elo in cadeia_encontrada:
        cn = elo.get("subject_cn", "")
        tp = elo.get("thumbprint", "")
        store = elo.get("store_path", "")
        if cn and tp:
            linhas.append(
                f"  # {cn}\n"
                f"  Export-Certificate -Cert '{store}\\{tp}' -FilePath 'C:\\temp\\{cn.replace(' ', '_')}.cer'"
            )
    linhas.extend(
        [
            "",
            "  # 3) Montar arquivo de cadeia (intermediarios, ordem leaf -> raiz, sem incluir raiz se autoassinada):",
            "  type AC_SAFEWEB_RFB_v5.cer > ez_cadeia.pem",
            "",
            "  # 4) Gerar novo PFX com cadeia:",
            "  openssl pkcs12 -export -out ez_com_cadeia.pfx -inkey ez_chave.pem -in ez_leaf.pem -certfile ez_cadeia.pem",
            "",
            "Certificados intermediarios a incluir em ez_cadeia.pem:",
        ]
    )
    if faltantes:
        for f in faltantes:
            linhas.append(f"  - {f}")
    else:
        linhas.append("  (nenhum — PFX ja contem todos os intermediarios esperados)")
    linhas.append("")
    return linhas


def auditar_cadeia_icp(pfx_path: str, senha: str) -> dict:
    """
    Audita cadeia ICP-Brasil: PFX vs Windows stores.
    Grava debug/auditoria_cadeia_icp.txt
    """
    _private_key, leaf, chain_pfx = _carregar_pfx(pfx_path, senha)
    leaf_info = _resumo_cert(leaf, "leaf")
    cnpj = extrair_cnpj_certificado(pfx_path, senha)
    emissor_cn = leaf_info["issuer_cn"]

    win_certs = _powershell_listar_certificados()
    cadeia_win, ausentes_win = _montar_cadeia_esperada(leaf, win_certs)

    intermediarios_esperados = _intermediarios_esperados_pfx(cadeia_win)
    # Manual NFS-e EndCertOnly: PFX precisa ao menos do emissor direto do leaf
    if emissor_cn and emissor_cn not in intermediarios_esperados:
        intermediarios_esperados = [emissor_cn] + intermediarios_esperados
    elif not intermediarios_esperados and emissor_cn:
        intermediarios_esperados = [emissor_cn]
    # Para diagnostico PFX, exigir somente o 1o intermediario (emissor direto)
    intermediarios_esperados_pfx = [emissor_cn] if emissor_cn else intermediarios_esperados[:1]

    intermediarios_pfx = _intermediarios_no_pfx(chain_pfx)
    faltantes_pfx = _faltantes_pfx(intermediarios_esperados_pfx, intermediarios_pfx)

    chain_len_atual = len(chain_pfx)
    chain_len_esperado = len(intermediarios_esperados_pfx)

    safe_web_hits = _buscar_por_cn(win_certs, "AC SAFEWEB RFB v5")
    leaf_win_hits = _buscar_por_cn(win_certs, leaf_info["subject_cn"])
    leaf_serial = leaf_info["serial"]
    leaf_win_correto = None
    for hit in leaf_win_hits:
        # Identificar leaf RFB pelo emissor AC SAFEWEB (certificado em uso no PFX)
        if emissor_cn.upper() in (hit.get("issuer") or "").upper():
            if hit.get("has_private_key"):
                leaf_win_correto = hit
                break

    linhas = [
        "==================================",
        "AUDITORIA CADEIA ICP-BRASIL — NFS-e Nacional",
        f"Gerado em: {datetime.now(ZoneInfo('America/Sao_Paulo')).isoformat(timespec='seconds')}",
        "==================================",
        "",
        "=== CONTEXTO ===",
        "AC emissora identificada: AC SAFEWEB RFB v5",
        "Cadeia esperada (tipica ICP-Brasil e-CNPJ A1):",
        "  [1] Certificado leaf (e-CNPJ A1) — EZ LOGISTICA",
        "  [2] AC SAFEWEB RFB v5 (intermediario)",
        "  [3] Autoridade Certificadora Raiz Brasileira v5/v10 (raiz ICP-Brasil)",
        "",
        "Nota: PFX PKCS#12 deve incluir ao menos o(s) intermediario(s), nao necessariamente a raiz.",
        "",
        "=== ARQUIVO PFX CONFIGURADO ===",
        f"caminho: {Path(pfx_path).resolve()}",
        f"chain_len_atual: {chain_len_atual}",
        f"chain_len_esperado (intermediarios no PFX): {chain_len_esperado}",
        "",
        "=== CERTIFICADO LEAF (principal) ===",
        f"subject: {leaf_info['subject']}",
        f"issuer:  {leaf_info['issuer']}",
        f"emissor_cn: {emissor_cn}",
        f"serial:  {leaf_info['serial']}",
        f"CNPJ: {cnpj or '(nao identificado)'}",
        f"validade: {_fmt_dt(leaf_info['not_before'])} ate {_fmt_dt(leaf_info['not_after'])}",
        f"sha256: {leaf_info['sha256']}",
        "",
        "=== CADEIA NO PFX (atual) ===",
    ]

    if chain_pfx:
        for item in _cadeia_no_pfx(chain_pfx):
            linhas.extend(
                [
                    f"  - {item['subject_cn']}",
                    f"    subject: {item['subject']}",
                    f"    issuer:  {item['issuer']}",
                    f"    sha256: {item['sha256']}",
                ]
            )
    else:
        linhas.append("  (vazia — PFX exportado SEM certificados intermediarios)")

    linhas.extend(
        [
            "",
            "=== CADEIA ENCONTRADA NO WINDOWS ===",
            f"repositorios auditados: {', '.join(f'{s[0]}\\\\{s[1]}' for s in WINDOWS_STORES[:4])}",
            f"  + Root (referencia): CurrentUser\\Root, LocalMachine\\Root",
            f"total_certificados_lidos: {len(win_certs)}",
            "",
        ]
    )

    if cadeia_win:
        for elo in cadeia_win:
            linhas.extend(
                [
                    f"  [{elo['nivel']}] {elo['subject_cn']} ({elo['papel']})",
                    f"      store: {elo['store']}",
                    f"      thumbprint: {elo['thumbprint']}",
                    f"      issuer: {elo['issuer']}",
                    f"      validade_ate: {elo.get('not_after', '')}",
                ]
            )
    else:
        linhas.append("  (nenhum elo localizado a partir do emissor do leaf)")

    linhas.extend(["", "=== AC SAFEWEB RFB v5 (busca direta nos repositorios) ==="])
    if safe_web_hits:
        for hit in safe_web_hits:
            linhas.extend(
                [
                    f"  encontrado em: {hit.get('scope')}\\{hit.get('store')}",
                    f"  subject: {hit.get('subject')}",
                    f"  thumbprint: {hit.get('thumbprint')}",
                    f"  has_private_key: {hit.get('has_private_key')}",
                ]
            )
    else:
        linhas.append("  NAO encontrado em CurrentUser/My, LocalMachine/My, CurrentUser/CA, LocalMachine/CA")

    linhas.extend(["", "=== LEAF NO WINDOWS (busca por CN) ==="])
    if leaf_win_correto:
        linhas.extend(
            [
                "  *** CERTIFICADO CORRETO (emissor AC SAFEWEB RFB v5, chave privada) ***",
                f"  store: {leaf_win_correto.get('scope')}\\{leaf_win_correto.get('store')}",
                f"  subject: {leaf_win_correto.get('subject')}",
                f"  thumbprint: {leaf_win_correto.get('thumbprint')}",
                f"  serial_pfx: {leaf_serial}",
            ]
        )
    if leaf_win_hits:
        linhas.append("")
        linhas.append(f"  Total encontrados com mesmo CN: {len(leaf_win_hits)} (inclui certificados antigos)")
        for hit in leaf_win_hits:
            marca = " <-- USAR ESTE" if leaf_win_correto and hit.get("thumbprint") == leaf_win_correto.get("thumbprint") else ""
            linhas.extend(
                [
                    f"  store: {hit.get('scope')}\\{hit.get('store')}{marca}",
                    f"  subject: {hit.get('subject')}",
                    f"  issuer: {hit.get('issuer')}",
                    f"  thumbprint: {hit.get('thumbprint')}",
                    f"  has_private_key: {hit.get('has_private_key')}",
                ]
            )
    else:
        linhas.append("  Leaf nao encontrado nos repositorios Windows (pode existir apenas como arquivo PFX).")

    linhas.extend(["", "=== CADEIA AUSENTE ==="])
    if faltantes_pfx:
        linhas.append("Intermediarios ESPERADOS no PFX mas AUSENTES no arquivo atual:")
        for f in faltantes_pfx:
            linhas.append(f"  - {f}")
    else:
        linhas.append("  Nenhum intermediario ausente no PFX (cadeia PKCS#12 completa).")

    if ausentes_win:
        linhas.append("")
        linhas.append("Elos NAO encontrados no Windows (impedem exportacao automatica com cadeia):")
        for a in ausentes_win:
            linhas.append(f"  - {a.get('subject_cn_buscado')} ({a.get('issuer_dn_buscado')})")

    linhas.extend(
        [
            "",
            "=== RESUMO ===",
            f"chain_len_atual:    {chain_len_atual}",
            f"chain_len_esperado: {chain_len_esperado}",
            f"exportacao_sem_cadeia: {'SIM' if chain_len_atual == 0 and chain_len_esperado > 0 else 'NAO'}",
        ]
    )

    if chain_len_atual == 0 and chain_len_esperado > 0:
        linhas.extend(
            [
                "",
                "DIAGNOSTICO:",
                "Possivel causa do E0714: certificado A1 exportado sem cadeia intermediaria.",
                f"Faltam no PFX: {', '.join(faltantes_pfx) if faltantes_pfx else emissor_cn}",
            ]
        )

    linhas.extend(["", "=== INSTRUCOES (nao executadas automaticamente) ===", ""])
    linhas.extend(
        _instrucoes_exportacao(
            leaf_info["subject_cn"],
            emissor_cn,
            faltantes_pfx or intermediarios_esperados_pfx,
            pfx_path,
            leaf_win_correto,
        )
    )
    linhas.extend(
        _instrucoes_reconstruir(
            faltantes_pfx or intermediarios_esperados_pfx,
            cadeia_win,
            pfx_path,
        )
    )

    texto = "\n".join(linhas)
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    DEBUG_RELATORIO.write_text(texto + "\n", encoding="utf-8")

    return {
        "relatorio_path": str(DEBUG_RELATORIO.resolve()),
        "pfx_path": str(Path(pfx_path).resolve()),
        "chain_len_atual": chain_len_atual,
        "chain_len_esperado": chain_len_esperado,
        "intermediarios_pfx": intermediarios_pfx,
        "ac_safeweb_rfb_v5_no_pfx": any(
            "safeweb rfb v5" in (x or "").lower() for x in intermediarios_pfx
        ),
        "faltantes_pfx": faltantes_pfx,
        "cadeia_win": cadeia_win,
        "ausentes_win": ausentes_win,
        "texto": texto,
    }
