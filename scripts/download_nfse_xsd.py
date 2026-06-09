"""Baixa e extrai XSDs oficiais NFS-e Nacional v1.01."""
import io
import sys
import zipfile
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
XSD_DIR = ROOT / "nfse_nacional" / "schemas" / "v1.01"
URLS = [
    "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip/@@download/file/NFSe-ESQUEMAS_XSD-v1.01-20260209.zip",
    "https://www.gov.br/nfse/pt-br/biblioteca/documentacao-tecnica/documentacao-atual/nfse-esquemas_xsd-v1-01-20260209.zip",
]
MIRROR_XSD_URLS = [
    "https://raw.githubusercontent.com/pedrocasado/nfse-php/master/storage/schemes/v1.01/DPS_v1.01.xsd",
]
MIRROR_XSD_FILES = [
    "DPS_v1.01.xsd",
    "NFSe_v1.01.xsd",
    "evento_v1.01.xsd",
    "pedRegEvento_v1.01.xsd",
    "tiposComplexos_v1.01.xsd",
    "tiposSimples_v1.01.xsd",
    "tiposEventos_v1.01.xsd",
    "xmldsig-core-schema.xsd",
    "CNC_v1.00.xsd",
    "tiposCnc_v1.00.xsd",
]


def main():
    data = None
    for url in URLS:
        try:
            print("Tentando", url)
            with urlopen(url, timeout=60) as r:
                data = r.read()
            if data[:2] == b"PK":
                break
            print("Resposta não é ZIP:", len(data), "bytes")
            data = None
        except Exception as exc:
            print("Falha:", exc)
    XSD_DIR.mkdir(parents=True, exist_ok=True)
    if data:
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            zf.extractall(XSD_DIR)
        xsds = sorted(XSD_DIR.rglob("*.xsd"))
        print("OK extraído (oficial) em", XSD_DIR)
        for p in xsds:
            print(" ", p.relative_to(ROOT))
        return

    print("ZIP oficial indisponível — baixando mirror GitHub nfse-php")
    base = "https://raw.githubusercontent.com/pedrocasado/nfse-php/master/storage/schemes/v1.01"
    for nome in MIRROR_XSD_FILES:
        url = f"{base}/{nome}"
        print(" ", url)
        with urlopen(url, timeout=60) as r:
            (XSD_DIR / nome).write_bytes(r.read())
    xsds = sorted(XSD_DIR.glob("*.xsd"))
    print("OK mirror em", XSD_DIR)
    for p in xsds:
        print(" ", p.relative_to(ROOT))


if __name__ == "__main__":
    main()
