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


## V30
- Distância por Google Maps no modal de envio/troca.
- Ranking por online/livre e menor distância.
- Fallback aproximado quando Google não retornar rota.


## V31
- Central mostra somente serviços do dia que não estejam finalizados.
- Motorista envia GPS automaticamente ao entrar e a cada 30 segundos.
- Distância exibe mensagens claras quando faltar GPS/origem/chave Google.
- Banco ganha origem_lat/origem_lng para cache de geolocalização.


## V32
- Distância usa Google Distance Matrix direto com o endereço da origem do serviço.
- Evita depender primeiro do geocoding/cache da origem.
- Adiciona diagnóstico /api/servicos/{id}/debug-distancia para validar chave/endereço/GPS.


## V33
- Corrige erro `name 'urllib' is not defined` no cálculo de distância Google.


## V34
- Área do motorista tem aviso sonoro tipo sirene quando novo serviço chega.
- Motorista pode ativar/testar sirene no celular.
- Também vibra o celular quando suportado.
