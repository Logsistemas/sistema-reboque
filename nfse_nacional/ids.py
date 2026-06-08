import re
import hashlib


def so_digitos(v):
    return re.sub(r"\D", "", str(v or ""))


def pad_serie(serie):
    s = so_digitos(serie) or "1"
    return s.zfill(5)[-5:]


def pad_ndps(numero):
    """nDPS: 1-15 dígitos numéricos; Id exige 15 posições."""
    n = so_digitos(numero) or "1"
    if len(n) > 15:
        n = n[-15:]
    return n.zfill(15)


def gerar_id_dps(c_mun_ibge, cnpj, serie, numero_dps):
    """
    Padrão TSIdDPS (45 chars):
    DPS + cMun(7) + tpInsc(1) + inscFederal(14) + serie(5) + nDPS(15)
    tpInsc: 2 = CNPJ (padrão nacional NFS-e)
    """
    mun = so_digitos(c_mun_ibge).zfill(7)[-7:]
    doc = so_digitos(cnpj).zfill(14)[-14:]
    ser = pad_serie(serie)
    ndps = pad_ndps(numero_dps)
    return f"DPS{mun}2{doc}{ser}{ndps}"


def gerar_id_evento_cancelamento(chave_acesso, seq=1):
    """PRE + chave(50) + tpEvento(101) + nPed(3) = 59 chars."""
    ch = so_digitos(chave_acesso)
    if len(ch) != 50:
        raise ValueError("Chave de acesso deve ter 50 dígitos")
    n_ped = str(max(1, int(seq))).zfill(3)
    return f"PRE{ch}101{n_ped}"


def ndps_deterministico(nota_id, numero_rps):
    """Gera nDPS estável a partir da nota (idempotência/recuperação)."""
    base = f"{nota_id}:{numero_rps}"
    h = hashlib.sha256(base.encode()).hexdigest()
    num = int(h[:14], 16) % (10**14 - 1) + 1
    return str(num).zfill(15)
