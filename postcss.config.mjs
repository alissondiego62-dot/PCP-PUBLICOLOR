/**
 * O PCP-PUBLICOLOR utiliza arquivos CSS nativos e não depende do Tailwind CSS.
 * Esta configuração neutra substitui a configuração antiga que tentava carregar
 * o pacote removido "@tailwindcss/postcss" durante o build da Vercel.
 */
const config = {
  plugins: {},
};

export default config;
