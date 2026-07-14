# Revisão geral — Publicolor 2.0

## Escopo

Revisão do ZIP mais recente, cobrindo sincronização do Google Drive, páginas, modais, ações, responsividade, integridade das rotas, auditoria e limpeza de arquivos não utilizados.

## Google Drive

### Correções

- validação obrigatória do escopo completo do Drive;
- localização por número completo e por estruturas antigas;
- registro persistente das raízes e pastas de categoria por OS;
- varredura recursiva única, com proteção contra ciclos e duplicações;
- suporte a raiz, sete categorias, subpastas livres e atalhos de pasta;
- nenhum filtro por extensão ou tipo MIME;
- suporte a arquivos Google e exportação para download;
- restauração de arquivos removidos apenas da OS;
- vínculo único por `order_id + drive_file_id`;
- verificação final entre os arquivos encontrados e os arquivos efetivamente visíveis na OS;
- retorno por categoria, quantidade encontrada, quantidade exibida e pastas consultadas;
- identificação do usuário do Publicolor e do último modificador informado pelo Google;
- histórico de envio, sincronização, restauração, remoção e exclusão.

### Pastas verificadas

- Arte;
- Aprovação;
- Produção;
- Documentos;
- Fotos;
- Instalação/entrega;
- Outros;
- quaisquer subpastas existentes abaixo delas ou da raiz da ordem.

## Revisão por página

### Dashboard

- cards com quebra segura de conteúdo;
- indicadores adaptáveis a larguras menores;
- carregamento e erros preservados;
- navegação para os módulos operacionais mantida.

### Produção — Kanban

- filtros e responsável preservados;
- cards com largura mínima controlada;
- textos longos não ultrapassam os cartões;
- rolagem horizontal mantida onde é necessária;
- áreas de toque ajustadas para tablet e celular.

### Pedidos

- OP principal e subpedidos preservados;
- tabela adaptável e conteúdo sem sobreposição;
- filtros, pesquisa, responsável e ações mantidos;
- informações extensas quebram linha corretamente.

### Concluídos

- ações de histórico e reabertura preservadas;
- botões responsivos e sem colisão;
- exibição adaptável em telas menores.

### Agenda de instalação/entrega

- calendário mensal e navegação entre meses preservados;
- seleção de dia e listagem de pedidos mantidas;
- células, cabeçalho e detalhes ajustados para telas estreitas.

### Clientes

- cadastro e edição preservados;
- associação de pedidos por ID e compatibilidade com nomes antigos;
- modal responsivo;
- textos e ações sem sobreposição.

### Relatórios

- cards e tabelas protegidos contra estouro horizontal;
- métricas e filtros mantidos;
- rolagem controlada para tabelas extensas.

### Usuários

- perfis inativos não recebem privilégios administrativos na interface;
- formulários e ações preservados;
- modais com fechamento por Escape e bloqueio de rolagem do fundo.

### Configurações

- Google Drive;
- importação/exportação CSV e XML;
- banco, ambiente, Vercel e execução controlada de SQL;
- painéis e campos responsivos;
- segredos continuam mascarados e processados no servidor.

### Ordem de serviço

Revisadas as abas:

- Resumo;
- Produção;
- Materiais;
- Arquivos;
- Checklist;
- Instalação/entrega;
- Histórico;
- Comentários.

O modal respeita a altura da tela, possui rolagem interna e mantém as abas acessíveis por rolagem horizontal em dispositivos menores.

## Responsividade

Foi adicionada uma camada final conservadora em `app/site-audit.css`, importada por último, para:

- impedir estouro em grids e flexboxes;
- ajustar modais ao viewport;
- permitir quebra de e-mails, nomes, caminhos e números de OP;
- organizar ações de arquivos em grade independente;
- transformar ações em coluna em celulares estreitos;
- manter tabelas em contêiner com rolagem horizontal;
- ampliar alvos de toque;
- respeitar preferência por redução de movimento.

## Desempenho e limpeza

- eventos em tempo real são agrupados por um pequeno debounce para evitar recargas repetidas;
- avisos e timers são limpos corretamente;
- removidos exemplos, worker antigo, assets padrão não utilizados e documentos de correções já incorporadas;
- mantidas apenas as documentações consolidadas e os arquivos necessários ao funcionamento.

## Banco de dados

A migração `20260723010000_drive_order_folder_registry_and_sync.sql`:

- cria o registro de pastas do Drive por pedido;
- remove vínculos históricos duplicados;
- cria índice único por pedido e arquivo do Drive;
- adiciona data e quantidade da última sincronização.

## Validações executadas

- resolução de imports locais;
- análise sintática dos arquivos TypeScript/TSX;
- análise sintática de todos os arquivos CSS;
- auditoria de botões, imagens e links externos;
- revisão das rotas protegidas;
- verificação da integridade da migração;
- verificação da integridade do ZIP final.

O build de produção completo deve ser executado na máquina do projeto ou na Vercel, porque o ambiente de revisão não tinha acesso ao registro do npm para instalar as dependências.
