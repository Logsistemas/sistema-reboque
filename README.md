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


## V35
- Corrige exibição do card de sirene na Área do Motorista.
- Sirene precisa ser ativada uma vez no celular por regra do navegador.
- Toca também se já houver serviço enviado ao abrir a tela.

## V37 - API App Motorista
- Mantém a V35 estável como base.
- Adiciona APIs JSON para o app Android Essência Logística.
- Login separado por motorista: login/senha/placa do dia.
- Endpoints para serviços, status, GPS, online/offline e token futuro de Firebase.


## V38 - Menu Motoristas
- Adiciona botão "Motoristas" no cabeçalho da central.
- Nova tela /motoristas com todos os motoristas cadastrados.
- Permite alterar login, senha, placa atual, dados do cadastro, ativo/inativo e online/offline.
- Mantém histórico: inativar motorista não apaga serviços antigos.
