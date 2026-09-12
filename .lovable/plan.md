# Prefeituras nacionais, monitoramento exclusivo e tornados

## Resultado
- Disponibilizar todos os municípios brasileiros a partir do cadastro oficial do IBGE, armazenados na nuvem.
- Manter uma única prefeitura monitorada para todo o sistema, com troca consistente em qualquer aparelho.
- Corrigir botões, rolagem e áreas de toque no Android, especialmente o botão “Monitorar”.
- Adicionar tornados aos alertas e ao mapa usando avisos meteorológicos oficiais em tempo real.

## Implementação
1. Criar na nuvem o cadastro público de municípios e a configuração única de monitoramento, com regras que garantam somente uma seleção ativa.
2. Importar o cadastro nacional oficial com coordenadas municipais e atualizar os tipos do aplicativo.
3. Substituir a lista local de prefeituras por leitura paginada/pesquisa na nuvem; a troca de monitoramento será persistida imediatamente e refletida em todas as telas.
4. Ajustar o painel municipal, a Central de Notificações e o vigia automático para usarem a mesma prefeitura monitorada na nuvem.
5. Criar uma fonte de tornados baseada em alertas oficiais, normalizá-la no motor ambiental e exibi-la na Central de Alertas, painel municipal e mapa.
6. Ampliar alvos de toque, eliminar dependência de hover e impedir gestos de janela/mapa de bloquear botões no Android.
7. Validar pesquisa, troca de prefeitura, persistência após recarregar, alertas, mapa e botões em celular Android e desktop.

## Detalhes técnicos
- Cadastro municipal: código IBGE, nome, UF, coordenadas, raio padrão e busca indexada.
- Exclusividade: uma linha de configuração global referencia o município monitorado; a troca será atômica.
- Tornados: somente eventos reais com validade ativa e localização fornecida pela fonte; sem simulação.
- A lista será pesquisável e paginada para não carregar milhares de cartões de uma vez no celular.
