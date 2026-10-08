# Sillocta · Maison de Decants

Loja de decants com catálogo, filtros por coleção e marca, páginas individuais de fragrâncias, favoritos, sacola e checkout pelo WhatsApp.

## Publicação na Vercel

- Raiz do projeto: este diretório.
- Framework: Other.
- Node.js: 22.x.
- Build: `npm run build`.
- Saída: `public`.

O arquivo `vercel.json` define o build e a saída. O deploy de produção acompanha a branch `main` na integração existente com a Vercel.

## Desenvolvimento e verificação

```sh
npm run build
npm test
```

O build gera a home e 26 páginas de perfumes. Não há dependências de produção adicionais. Os arquivos em `source/` são a fonte da publicação; `public/` é gerado e não deve ser editado ou versionado.

A versão atual é a **23**, com controles de coleção precisos e botões de compra, volume e checkout refinados para celular e telas grandes. Consulte [LEIA-ME.md](LEIA-ME.md) para detalhes de publicação, domínio e checkout.

O checkout atual é pelo WhatsApp. Mercado Pago permanece desativado até que o servidor de pagamentos e suas credenciais sejam configurados e validados. As consultas de CEP dependem dos serviços externos utilizados pelo site.

O `index.html` e a pasta `assets/` na raiz preservam um modo de compatibilidade com a hospedagem estática anterior. O arquivo `index.html.html` mantém a versão legada já existente no repositório.
