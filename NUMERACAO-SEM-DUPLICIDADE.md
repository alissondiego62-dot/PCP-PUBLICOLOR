# Numeração de OS sem duplicidade

A versão valida o número da OS antes de cadastrar ou editar e também protege a tabela `orders` no Supabase.

- Números vazios ou formados apenas por zeros continuam gerando uma numeração automática.
- Números já existentes são bloqueados no cadastro manual, importação por PDF e edição da OS.
- A importação CSV/XML informa a linha que possui número duplicado.
- O banco compara os números sem diferenciar maiúsculas/minúsculas e ignora espaços nas extremidades.
- Um bloqueio transacional impede duplicidade mesmo quando dois usuários salvam simultaneamente.

Execute a migração `20260727030000_prevent_duplicate_order_numbers.sql` antes de publicar o código.
