"""Teste inferir_tipo_veiculo — espelha app motorista."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app import inferir_tipo_veiculo, imagem_checklist_parte

CASOS = [
    ('REBOQUE — EXTRA PESADO', 'pesado'),
    ('REBOQUE — CAMINHÃO', 'pesado'),
    ('REBOQUE CAMINHAO', 'pesado'),
    ('R. L. PESADO', 'pesado'),
    ('R. E. PESADO', 'pesado'),
    ('C. MEC. LEVE', 'leve'),
    ('REBOQUE LEVE', 'leve'),
    ('MOTO', 'moto'),
    ('UTILITÁRIO / VAN', 'utilitario'),
]

ok = 0
for entrada, esperado in CASOS:
    got = inferir_tipo_veiculo({'tipo': entrada, 'tipo_servico': entrada})
    status = 'OK' if got == esperado else 'FALHA'
    print(f'{status}: {entrada!r} => {got} (esperado {esperado})')
    if got == esperado:
        ok += 1

img = imagem_checklist_parte('Frente', 'pesado')
if 'pesado_frente.png' not in img:
    print(f'FALHA: imagem pesado frente => {img}')
    sys.exit(1)
print(f'OK: imagem pesado frente => {img}')

print(f'\n{ok}/{len(CASOS)} casos OK')
sys.exit(0 if ok == len(CASOS) else 1)
