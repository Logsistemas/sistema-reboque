NS = "http://www.sped.fazenda.gov.br/nfse"
NS_DS = "http://www.w3.org/2000/09/xmldsig#"
VERSAO_DPS = "1.00"
VER_APLIC = "1.00"

SEFIN_BASE = {
    "homologacao": "https://sefin.producaorestrita.nfse.gov.br/SefinNacional",
    "producao": "https://sefin.nfse.gov.br/SefinNacional",
}

DANFSE_BASE = {
    "homologacao": "https://adn.producaorestrita.nfse.gov.br/danfse",
    "producao": "https://adn.nfse.gov.br/danfse",
}

TP_AMB = {"homologacao": 2, "producao": 1}

# Teste E0714 — homologação (Manual Integrado v1.01: rsa-sha1 / sha1)
NFSE_SIGNATURE_ALGORITHM = "rsa-sha1"
NFSE_DIGEST_ALGORITHM = "sha1"

NFSE_SIGNATURE_ALGORITHM_PRODUCAO = "rsa-sha256"
NFSE_DIGEST_ALGORITHM_PRODUCAO = "sha256"


def algoritmos_assinatura_nfse(ambiente=None):
    """Homologação usa SHA-1 (teste E0714); produção mantém SHA-256."""
    amb = (ambiente or "homologacao").lower()
    if amb == "producao":
        return NFSE_SIGNATURE_ALGORITHM_PRODUCAO, NFSE_DIGEST_ALGORITHM_PRODUCAO
    return NFSE_SIGNATURE_ALGORITHM, NFSE_DIGEST_ALGORITHM
