# Google Drive — integração e sincronização

## Permissão necessária

O Publicolor solicita o escopo completo do Google Drive:

```text
https://www.googleapis.com/auth/drive
```

O antigo escopo `drive.file` permite enxergar principalmente arquivos criados pelo próprio aplicativo. Ele não é suficiente para sincronizar com segurança tudo que foi colocado manualmente nas pastas pelo Drive.

Se a conexão foi criada com o escopo antigo, desconecte e conecte novamente a conta no Publicolor.

## Estrutura reconhecida

```text
PUBLICOLOR - SISTEMA PCP
└── CLIENTES
    └── Cliente
        └── OP ou subpedido
            ├── 01 - ARTE
            ├── 02 - APROVAÇÃO
            ├── 03 - PRODUÇÃO
            ├── 04 - DOCUMENTOS
            ├── 05 - FOTOS
            ├── 06 - INSTALAÇÃO
            └── 07 - OUTROS
```

Nomes antigos e variações sem número também são reconhecidos.

## Como a sincronização funciona

1. Carrega os IDs de pastas registrados para a ordem.
2. Usa arquivos já vinculados e sessões pendentes como referências adicionais.
3. Localiza pastas pelo número completo da OP.
4. Sobe pela árvore do Drive para encontrar a raiz real.
5. Percorre recursivamente a raiz, categorias, subpastas livres e atalhos de pasta.
6. Vincula qualquer item que não seja pasta, sem filtro de extensão ou MIME.
7. Atualiza metadados e restaura vínculos removidos apenas da OS.
8. Compara a lista do Drive com a lista visível no banco. Se faltar algum arquivo, retorna erro com os nomes faltantes em vez de informar falso sucesso.

## Remover e excluir

- **Remover da OS:** oculta o vínculo no sistema. Ao sincronizar novamente, o arquivo volta a aparecer se ainda estiver no Drive.
- **Excluir do Drive:** exclui o arquivo no Google Drive e remove o vínculo da OS.

## Segurança

- Tokens e Client Secret ficam cifrados no banco.
- A Service Role é usada somente nas rotas de servidor.
- Usuários autenticados podem anexar e baixar conforme as permissões do sistema.
- Configuração, desconexão e exclusão definitiva permanecem administrativas.
