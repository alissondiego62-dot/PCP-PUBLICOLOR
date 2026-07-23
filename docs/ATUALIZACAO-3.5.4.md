# Publicolor PCP 3.5.4

## Alterações

- Miniaturas do Kanban passam a usar `object-fit: contain`, exibindo o PNG completo sem cortar as bordas.
- A regra também cobre páginas de PDF, modo compacto, pilhas e miniatura da Ordem de Serviço.
- Novo botão de impressão nos cartões individuais, nas pilhas e na visualização ampliada.
- Quando a ordem possuir páginas complementares, todas são carregadas e impressas, cada uma em uma folha.
- Nas pilhas, a impressão reúne todas as páginas de todos os subpedidos que possuem imagem.
- Nenhuma alteração de banco de dados é necessária.
