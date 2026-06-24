"""Valida exibição de observações na Central (API + HTML)."""
import json
import os
import re
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("API_BASE", "http://127.0.0.1:8000").rstrip("/")
SID = os.environ.get("TEST_SERVICO_ID", "292f5367-baf2-4066-95a9-e36c8e371a4c")


def req(method, path, body=None):
    url = f"{BASE}{path}"
    data = None
    headers = {}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw and raw.strip().startswith("{") else raw
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8")
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


def bloco_parte(html, parte):
    m = re.search(rf"<h2>{re.escape(parte)}</h2>(.*?)</div>\s*(?=<div class=\"chk-bloco\">|<div class=\"chk-bloco\">|$)", html, re.S)
    if not m:
        m = re.search(rf"<h2>{re.escape(parte)}</h2>(.*?)(?=<h2>|</body>)", html, re.S)
    return m.group(1) if m else ""


def main():
    status, dados = req("GET", f"/api/checklist-dados/{SID}")
    if status != 200:
        print("FAIL api checklist-dados", status)
        sys.exit(1)

    partes = dados.get("partes") or {}
    frente_obs = (partes.get("Frente") or {}).get("observacao") or ""
    traseira_obs = (partes.get("Traseira") or {}).get("observacao") or ""
    print("JSON partes.Frente.observacao =", repr(frente_obs[:80]))
    print("JSON partes.Traseira.observacao =", repr(traseira_obs[:80]))

    if not frente_obs or not traseira_obs:
        print("WARN: serviço de teste sem observações nas duas partes — ajuste TEST_SERVICO_ID")

    status, html = req("GET", f"/servicos/{SID}/checklist")
    if status != 200 or not isinstance(html, str):
        print("FAIL html checklist", status)
        sys.exit(1)

    ok_label = "Observações:" in html
    ok_frente = frente_obs in html if frente_obs else True
    ok_traseira = traseira_obs in html if traseira_obs else True

    bf = bloco_parte(html, "Frente")
    ok_ordem = True
    if frente_obs and bf:
        pos_obs = bf.find("chk-observacao")
        pos_carro = bf.find("chk-carro-area")
        pos_fotos = bf.find("chk-fotos-grid")
        ref = max(pos_carro, pos_fotos)
        if pos_obs >= 0 and ref >= 0:
            ok_ordem = pos_obs > ref
        elif pos_obs >= 0 and pos_carro >= 0:
            ok_ordem = pos_obs > pos_carro

    print("HTML Observações label", ok_label)
    print("HTML frente texto", ok_frente)
    print("HTML traseira texto", ok_traseira)
    print("HTML obs após diagrama/fotos (Frente)", ok_ordem)

    if ok_label and ok_frente and ok_traseira and ok_ordem:
        print("OK")
        sys.exit(0)
    print("FAIL")
    sys.exit(1)


if __name__ == "__main__":
    main()
