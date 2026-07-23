# Revisão complementar e sugestões — Publicolor PCP 3.4.1

## Ajustes recomendados para a próxima etapa

### 1. Catálogo de materiais

Criar uma lista reutilizável com nomes, unidades e medidas mais usadas. Isso reduz variações como `Metalom 20x20`, `Metalon 20 × 20` e `metalom 20/20`, sem transformar o sistema em controle completo de estoque.

### 2. Unidades padronizadas

Substituir o campo livre por uma lista configurável com `un`, `barra`, `chapa`, `m`, `m²`, `L`, `ml`, `kg` e outras unidades usadas pela Publicolor. Ainda deve existir a opção `Outra`.

### 3. Recebimento parcial guiado

Ao lançar quantidade recebida menor que a comprada, mostrar automaticamente:

- saldo pendente;
- percentual recebido;
- alerta na atividade principal;
- opção de registrar nova previsão.

### 4. Histórico visível dentro do editor

Exibir as últimas alterações do material em uma área recolhível: nome anterior, quantidade, preços, disponibilidade e usuário responsável.

### 5. Agenda com duração

Adicionar duração prevista da instalação ou entrega. Isso permitirá detectar conflitos reais, em vez de comparar somente horários próximos.

### 6. Equipes e veículos cadastrados

Trocar os campos livres por cadastros configuráveis. Isso reduz duplicidades como `Equipe 1`, `Equipe 01` e `EQUIPE 1` e melhora os filtros da Agenda.

### 7. Roteiro operacional

Gerar uma visualização diária com ordem sugerida, endereço, equipe, veículo, contato, observação e botão para copiar ou imprimir.

### 8. Alertas de banco desatualizado

Manter a detecção de colunas ausentes e adicionar, em Configurações, uma verificação automática que compare a versão do código com a versão das migrations instaladas.

### 9. Testes visuais

Adicionar testes Playwright específicos para:

- Materiais em 360, 390, 768, 1024 e 1366 px;
- editor completo com conteúdo longo;
- Agenda mensal, semanal e diária;
- pedidos com nomes e descrições extensas;
- teclado móvel e `datetime-local`.

### 10. Salvamento automático controlado

O editor completo usa salvamento confirmado por botão porque altera muitos campos relacionados. Para campos simples na linha, manter o salvamento automático. Essa separação reduz alterações acidentais em disponibilidade, status e recebimento.
