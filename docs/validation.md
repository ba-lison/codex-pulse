# Validação registrada

Data da validação inicial: **18/10/2026**. Esta página distingue testes de código, inspeção da interface real e ilustrações da documentação.

## Ambiente usado

| Componente | Ambiente observado |
|:--|:--|
| Sistema | Windows |
| Node | 22.21.1 |
| Codex CLI | 0.163.0 |
| App-server do desktop na investigação | 0.163.0-alpha.10.2, processo stdio |
| Interface do plugin verificada na lateral | 0.4.0 |
| Versão empacotada neste repositório | 0.4.1 |

Não é uma declaração de compatibilidade com todas as versões futuras do host.

## Matriz de evidência

| Item | Automatizado | Lateral real |
|:--|:--|:--|
| Normalização de conta, valores ausentes e zero real | Sim | Conta real observada |
| Versão da UI e servidor carregados | Contrato MCP | UI e servidor 0.4.0 conferidos |
| ID explícito da conversa | Parser e conflitos | Host encaminhou `thread_id` e `threadId` coerentes |
| Contexto e limite da mesma conversa | Parser | Leituras atualizando automaticamente |
| Distinção entre contexto e consumo acumulado | Parser / DOM | Métricas próprias dos agentes observadas |
| Troca de modelo e de conversa | Sim | Não exercitada manualmente |
| Compactação e queda de ocupação | Sim | Não exercitada manualmente |
| Faixas pessoais de aviso | Limites 25/50/51 | Faixa intermediária observada |
| Dois agentes vinculados | Parentesco e sessão | Conferidos no painel |
| Ocultar / Mostrar | DOM | Cliques reais; resumo mantido e execução continuou |
| Conclusão e remoção do grupo | Parser / retenção | Grupo deixou de aparecer após término |
| Interrupção de um filho | Parser | Feita pelo coordenador, e filho saiu da lista |
| Botão de parada do Pulse | Ausente por contrato | Não existe controle ativo nesta versão |
| Pose final e seis segundos exatos | Parser / DOM | Não capturados ao vivo; polling pode perder o intervalo |
| Layout a 319 px | — | Sem overflow horizontal na leitura observada |
| Outras larguras e contraste em todos os temas | Cobertura de estilos | Sem validação visual completa |
| Limpeza em `pagehide`, pausa e ausência de sobreposição | DOM / serviço | Não exercitadas manualmente em todas as formas de ocultação do host |
| Movimento reduzido | DOM | Preferência não alternada manualmente |
| Coroa acompanhando o salto / computador na 0.4.1 | Regressão automatizada | Ajuste visual final ainda não registrado no host |

## Testes automatizados

São **35 testes** no pacote atual:

- 20 para identidade, herança, contexto, modelo, compactação, término, arquivos parciais, parentesco, retenção e erro de leitura.
- 3 para normalização dos limites da conta.
- 12 para interface, avisos, métricas, bridge, ciclo de vida, ausência de sobreposição e movimento da coroa.

```powershell
node --test plugins/usage-panel/server/*.test.mjs plugins/usage-panel/ui/panel-ui.test.mjs
```

Os testes de DOM usam um ambiente simulado. Eles validam regras, não aparência ou comportamento completo do Codex Desktop.

## Integração de conta e registros

Uma execução real confirmou que duas consultas concorrentes e uma consulta seguinte compartilhavam uma única consulta de conta no mesmo serviço. Os subprocessos de teste foram encerrados.

O leitor foi exercitado com registros reais da conversa e dos agentes, preservando contexto por resposta e consumo acumulado separado. Testes com metadata injetada foram tratados como testes do parser; a associação automática só foi considerada comprovada depois da observação dos metadados reais encaminhados pela lateral.

## Por que o desktop precisou ser reaberto

A instalação em disco já estava na 0.4.0, mas a aba e os processos ainda usavam 0.3.0. Fechar e reabrir apenas a aba não trocou a cópia em memória. O reinício completo fez a lateral carregar UI e servidor 0.4.0.

Na 0.4.1, o pacote foi instalado e comparado com a fonte, e os testes da coroa passaram. A aba inspecionada naquele momento ainda era 0.4.0. Por isso a aparência do ajuste não é registrada aqui como validada no host.

## Por que a parada permanece indisponível

A investigação conseguiu conectar ao daemon local com handshake WebSocket. Ele era um runtime diferente do processo stdio do desktop e retornou zero conversas carregadas. Isso não fornece um caminho comprovado para interromper os agentes que o usuário está vendo.

A interrupção usada no teste de grupo foi feita pela ferramenta do coordenador sobre um agente criado exclusivamente para o teste. Ela prova a atualização observada pelo leitor, não uma capacidade de controle do plugin.

## Teste do pacote de instalação

`docs/tools/validate-package.mjs` cria um diretório temporário de configuração para um processo separado da CLI. Adiciona o marketplace local, instala o plugin, verifica versão e estado e testa `initialize`, `tools/list` e `resources/read` pelo stdio.

O procedimento não altera a instalação pessoal ativa, não usa credenciais reais e não inicia um turno de modelo. O smoke test local não substitui a validação de login e abertura no desktop de cada usuário.

```powershell
node docs/tools/validate-package.mjs
```

## Imagens do README

As imagens e o GIF são gerados por `docs/tools/render-assets.mjs` a partir do sprite original, das formas SVG e dos estados do código. As métricas são fixtures documentais. Os layouts são reproduções explicativas do componente, não capturas de execução.

O gerador é independente do servidor MCP e não faz consultas de conta ou leitura das sessões do usuário.
