"""Testes da tabela de valores por cliente (tipos + itens internos)."""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8000"


def req(method, path, body=None):
    url = f"{BASE}{path}"
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=45) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw.strip().startswith("{") else raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw}
    except Exception as e:
        return 0, {"erro": str(e)}


def main():
    status, lista = req("GET", "/api/cadastros/contatos?cliente=1")
    if status != 200 or not lista.get("ok"):
        print("FAIL listar clientes", status, lista)
        sys.exit(1)

    clientes = lista.get("itens") or []
    if not clientes:
        print("WARN sem clientes")
        sys.exit(0)

    cid = clientes[0]["id"]
    nome = clientes[0].get("nome_exibicao") or clientes[0].get("razao_social") or "Cliente"

    status, get0 = req("GET", f"/api/cadastros/contatos/{cid}/tabela-valores")
    if status != 200 or not get0.get("ok"):
        print("FAIL get tabela", status, get0)
        sys.exit(1)

    itens = get0.get("itens") or []
    grupos = get0.get("grupos") or []
    pesado_itens = [i for i in itens if i.get("tipo_servico") == "R. PESADO"]
    ok_itens = len(pesado_itens) >= 5
    ok_grupos = len(grupos) >= 10

    payload = []
    for it in itens:
        linha = dict(it)
        if it.get("tipo_servico") == "R. PESADO" and it.get("item") == "SAIDA":
            linha["valor_unitario"] = 500
        elif it.get("tipo_servico") == "R. PESADO" and it.get("item") == "KM VIAGEM":
            linha["valor_unitario"] = 5.03
        else:
            linha["valor_unitario"] = float(it.get("valor_unitario") or it.get("valor") or 0)
        payload.append(linha)

    status, put = req("PUT", f"/api/cadastros/contatos/{cid}/tabela-valores", {"itens": payload})
    if status != 200 or not put.get("ok"):
        print("FAIL put tabela", status, put)
        sys.exit(1)

    mapa_url = f"/api/clientes/tabela-valores/mapa-itens?seguradora={urllib.parse.quote(nome)}&tipo=R.%20PESADO"
    status, mapa = req("GET", mapa_url)
    itens_mapa = (mapa.get("itens") or {}) if mapa.get("ok") else {}
    ok_saida = float(itens_mapa.get("SAIDA") or 0) == 500
    ok_km = abs(float(itens_mapa.get("KM VIAGEM") or 0) - 5.03) < 0.01

    status, prec = req("GET", f"/api/clientes/tabela-valores/precos?seguradora={urllib.parse.quote(nome)}&tipo=R.%20PESADO&item=SAIDA")
    ok_prec = prec.get("ok") and float(prec.get("valor") or 0) == 500

    print("cliente", nome)
    print("itens total", len(itens), "pesado_itens", len(pesado_itens))
    print("ok_itens_pesado", ok_itens, "ok_grupos", ok_grupos, "ok_saida", ok_saida, "ok_km", ok_km, "ok_prec", ok_prec)

    if ok_itens and ok_grupos and ok_saida and ok_km and ok_prec:
        print("OK")
        sys.exit(0)
    print("FAIL")
    sys.exit(1)


if __name__ == "__main__":
    main()
