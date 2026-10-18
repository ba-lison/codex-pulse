# Arquitetura e origem dos dados

O Codex Pulse 0.4.1 é um plugin MCP local com uma interface embutida na conversa. O pacote de execução fica em `plugins/usage-panel/`. O código de documentação e seus exemplos ficam fora dessa pasta.

## Componentes

| Arquivo | Responsabilidade |
|:--|:--|
| `server/index.mjs` | Servidor MCP por stdio, catálogo da ferramenta, recurso HTML e diagnóstico mínimo. |
| `server/usage-service.mjs` | Consulta curta ao app-server, timeout de 15 s, cache e compartilhamento de consulta concorrente. |
| `server/panel-data.mjs` | Normalização da janela primária da conta e do timestamp de renovação. |
| `server/conversation-data.mjs` | Identidade, correlação de eventos e projeção de contexto/atividade. |
| `server/rollout-reader.mjs` | Descoberta e leitura incremental dos registros locais, incluindo buffers incompletos. |
| `ui/main.html` | Recurso MCP autocontido com CSS, acessórios SVG, estados e runtime incorporado. |
| `ui/panel-runtime.js` | Bridge, renderização e ciclo de vida do painel. |
| `ui/build-ui.mjs` | Incorporação do runtime ao HTML. |
| `ui/codex.webp` | Sprite original: 8 colunas × 11 linhas; células de 192 × 208 px. |

## Contratos MCP

- Transporte: `stdio`, iniciado pelo host com `node ${PLUGIN_ROOT}/server/index.mjs`.
- Ferramenta: `get_usage`, com anotação de somente leitura.
- Recurso: `ui://usage-panel/main.html`.
- MIME: `text/html;profile=mcp-app`.
- Entrypoint: somente `thread`.
- Controle de agentes: `capabilities.stopAgent = false`; nenhuma ferramenta `stop_agent` é anunciada.

A UI prioriza `window.openai.callTool` e tem alternativa de handshake pelo bridge MCP Apps. Uma leitura de sucesso entrega as seções de conta e conversa em `structuredContent`.

## Conta

Cada servidor MCP mantém uma consulta em andamento por vez. Chamadas concorrentes compartilham a mesma promessa; uma resposta recente pode ser reaproveitada por até 15 s. O subprocesso temporário executa a inicialização do protocolo e `account/rateLimits/read`, sem iniciar um turno de modelo.

O normalizador prefere o bucket `codex` em `rateLimitsByLimitId`. Mantém o fallback `rateLimits` para respostas compatíveis. Os campos relevantes são:

| Campo normalizado | Origem / regra |
|:--|:--|
| `usedPercent` | Percentual finito recebido, limitado ao intervalo 0–100. |
| `remainingPercent` | `100 - usedPercent`, somente quando o consumo é conhecido. |
| `resetsAt` | Timestamp Unix válido convertido em ISO. |
| `windowDurationMins` | Duração recebida, quando positiva. |

Os rótulos do produto preservam a janela primária de cinco horas. A secundária semanal foi removida da interface e da resposta normalizada.

## Identidade da conversa

O plugin aceita identificadores UUID explícitos dos metadados fornecidos pelo host, incluindo aliases como `threadId`, `thread_id` e o campo `x-codex-turn-metadata`. Identificadores conflitantes invalidam a seleção.

Não há fallback por diretório de trabalho, conversa mais recente, variável de ambiente do processo ou ID recebido como argumento do modelo. Os sinais enviados pela UI ajudam o diagnóstico; eles não escolhem a conversa no servidor.

A primeira linha `session_meta` do arquivo deve confirmar o ID esperado. Uma sessão filha pode conter metadata e histórico herdados do pai. A implementação não deixa esses registros substituírem a identidade do filho.

## Contexto, consumo e modelo

O coletor exige um `token_usage_record` com `thread_id` explícito e correspondente à conversa selecionada. Correlaciona o seu `turn_id` com o contexto de turno.

| Métrica | Campo |
|:--|:--|
| Ocupação observada após a resposta | `token_usage_record.usage.total_tokens` |
| Janela efetiva | Limite do turno e `token_count.info.model_context_window` correlacionado |
| Consumo acumulado próprio | `token_usage_record.thread_token_usage.total_tokens` |
| Modelo informado | `turn_context.model`, com invalidação quando há troca ou roteamento registrado |

Nas amostras reais verificadas, `usage.total_tokens` coincidiu com `last_token_usage.total_tokens`. O último é a base usada pela TUI oficial para contexto; o Pulse usa a divisão direta pela janela, sem copiar um baseline interno daquela UI.

Não usa `total_token_usage` histórico como contexto ocupado. Uma troca de modelo pode apagar a amostra até chegar uma nova resposta correlacionada. A troca de modelo dentro do mesmo turno também limpa o limite anterior. Eventos de compactação invalidam a ocupação antiga.

A contagem de tokens inclui entrada em cache; ela não estima dinheiro ou créditos faturados. O modelo configurado para o turno não garante, sem telemetria adicional, qual modelo remoto executou cada operação.

## Leitura incremental e parentesco

O índice dos arquivos locais é renovado a cada 15 s. O leitor guarda posição e buffer de bytes, preservando linhas JSON e caracteres UTF-8 que ainda não foram gravados por completo. Uma redução do arquivo reinicia o parser. Falhas de leitura não retornam contexto em cache como uma nova leitura bem-sucedida.

Os subagentes exigem `parent_thread_id` correspondente à conversa e `session_id` igual ao da raiz. A igualdade de sessão sozinha não é suficiente. A versão atual acompanha filhos diretos; não agrega todos os descendentes nem outras conversas abertas.

Os nomes são derivados do caminho registrado do agente. O alvo detalhado de arquivo/comando não é extraído em todos os formatos; a descrição pode ser apenas a observação genérica dos registros locais.

## Atividade e término

O parser reconhece ferramentas e eventos persistidos. Um evento desconhecido produz indisponibilidade, em vez de uma atividade presumida. Erro recuperável isolado não congela o relógio como se a execução tivesse terminado.

Término e aborto precisam pertencer ao turno próprio. Os filhos terminados são elegíveis para aparecer durante seis segundos após o horário registrado; depois são removidos. O polling de aproximadamente 15 s pode perder inteiramente esse intervalo. A retenção não garante seis segundos de exibição desde a primeira observação na UI.

## Renderização e movimento

A pose do sprite e a posição da coroa usam a mesma seleção de quadro. As âncoras da cabeça da 0.4.1 foram medidas no sprite original para acompanhar saltos e a posição no computador. O sprite não foi redesenhado. Os subagentes não recebem coroa.

As animações são locais. `prefers-reduced-motion` mantém um quadro estático. `document.hidden` suspende o trabalho de desenho e as consultas; `pagehide` encerra timers e listeners. Isso não comprova que toda forma de ocultação específica do host mude `document.hidden`.

## Distribuição e documentação

O marketplace está em `.agents/plugins/marketplace.json` e aponta para `./plugins/usage-panel`, relativo à raiz do repositório. O nome público do projeto é Codex Pulse; o plugin preserva o nome técnico `usage-panel` e o título de aba `Uso restante`.

As dependências npm são exclusivas do gerador de documentação. Os arquivos da interface instalável não importam fixtures ou imagens de demonstração da pasta `docs/`.
