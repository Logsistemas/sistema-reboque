# Sistema Interno de Reboque — V9
Histórico, Relatórios CFO e Operação ao vivo.


## V13 - Faturamento

Novidades:
- Tabela de preços baseada na planilha enviada.
- Itens financeiros por serviço: SAIDA, KM VIAGEM, KM DESLOCAMENTO, KM RETORNO, HORA PARADA, HORA TRABALHADA, PEDAGIO, ESTADIA etc.
- Ao cadastrar/importar serviço, o sistema cria itens financeiros com valores padrão.
- Nova aba `/faturamento` para auditoria e fechamento.
- Status de faturamento: para_conferir, para_faturar, negociacao, faturado.
- Exportação Excel inclui aba Itens_Faturamento.


## V23
- Central mostra somente serviços do dia atual.
- Histórico/Relatórios continuam com todos os serviços.


## V25
- Permite reenviar/trocar motorista enquanto o serviço não estiver finalizado.
- Bloqueia troca apenas quando o status for finalizado.
- Atualiza lista de motoristas online/offline antes de abrir a janela de envio.


## V28
- Remove mapa da Central e Operação ao Vivo para melhorar performance.
- Envio/troca de motorista lista motoristas livres, ocupados e offline.
- Estrutura pronta para cálculo de distância quando geocoding/Google Maps for ativado.


## V29
- Modal de envio/troca mostra ranking de motoristas no estilo AutEM.
- Preparado para Google Maps Distance Matrix via variável GOOGLE_MAPS_API_KEY.
- Mostra distância/tempo quando a chave estiver configurada; sem chave, mantém lista por disponibilidade.
