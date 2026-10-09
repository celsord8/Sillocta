# Sillocta · Maison de Decants

Loja de decants com catálogo, coleções, favoritos, sacola, 26 páginas individuais de perfumes e pedidos pelo WhatsApp.

## Publicação

A versão 35 inclui as seis campanhas, bordas douradas uniformes e carrossel contínuo a cada 1,8 segundo. O movimento respeita navegação manual, teclado, redução de movimento e a visibilidade da página.

O projeto preserva a integração do repositório `celsord8/Sillocta` com a Vercel. A branch `main` recebe produção; branches e pull requests podem gerar prévias pela integração existente.

- Framework: **Other**; raiz do projeto: este diretório.
- Node.js: **22.x**, com versão declarada em `package.json` e `.nvmrc`.
- Instalação: `npm ci --ignore-scripts`.
- Publicação: `npm run verify` — gera o site e executa todos os testes antes de liberar a versão.
- Saída: `public`; apenas o resultado do build fica público.

As configurações de publicação ficam em `vercel.json`. Não há dependências de produção adicionais. `package-lock.json` fixa a instalação. O workflow de GitHub Actions verifica pushes e pull requests com permissões somente de leitura e ações fixadas por commit.

## Desenvolvimento

```sh
npm ci --ignore-scripts
npm run verify
```

Edite `source/`; `public/` é gerado e ignorado pelo Git. Os arquivos legados na raiz do repositório não fazem parte da saída da Vercel e foram preservados.

O build gera páginas com URLs limpas e canônicas, `robots.txt`, sitemap de produção e uma página de erro 404. Prévias recebem `noindex` e bloqueiam indexação em `robots.txt`. Configure `PUBLIC_SITE_URL` apenas ao usar um domínio definitivo; sem ele, o build usa o domínio de produção informado pela Vercel.

O HTML sempre revalida. Fotografias originais usam cache de um dia; variantes de imagens identificadas pelo conteúdo e CSS/JS da versão corrente usam cache duradouro. Os cabeçalhos restringem incorporação por outros sites, objetos e alteração da URL base, sem bloquear os scripts e serviços já usados pela loja.

## Checkout e contas

Os pedidos atuais continuam pelo WhatsApp. Mercado Pago permanece desativado até existir servidor de pagamentos, banco persistente e credenciais homologadas. Nenhuma chave privada deve entrar no Git ou nos arquivos públicos.

A configuração por código não altera plano, cobrança, domínio contratado, permissões da conta ou proteções de branch. Consulte [LEIA-ME.md](LEIA-ME.md) para os requisitos de operação e publicação.
