# Publicolor PCP 3.5.5

## Correção de enquadramento

- A visualização ampliada agora usa toda a área útil do modal como quadro de enquadramento.
- O PNG é exibido com largura e altura de 100% e `object-fit: contain`, sem recortar topo, rodapé ou laterais.
- O zoom mínimo passa a ser 100%; acima disso, a área ampliada recebe rolagem.
- A miniatura da ficha da OS também foi reforçada para nunca usar `cover`.

## Correção da impressão

- A impressão passa a trabalhar com área A4 física calculada: 198 x 285 mm dentro de margens de 6 mm.
- Cabeçalho, imagem e rodapé possuem linhas de grade fixas, evitando que a imagem ultrapasse a folha.
- Cada PNG usa `width: 100%`, `height: 100%` e `object-fit: contain` dentro da área disponível.
- Todas as páginas complementares continuam sendo impressas, uma por folha.

Não existe alteração de banco de dados nesta versão.
