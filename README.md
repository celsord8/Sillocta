# Sillocta · Maison de Decants

Loja de apresentação com catálogo de 26 perfumes, decants de 5 e 10 ml, favoritos, sacola e guia de curadoria. A identidade aprovada usa Montserrat e Cormorant Garamond, preto e dourado.

## Executar

Use Node 22: `npm ci --ignore-scripts` e `npm run verify`. O build gera `public/`, a home, 26 páginas individuais, CSS consolidado, metadados e página 404. Não editar `public/` manualmente.

## Organização e estilos

- `source/index.html`: estrutura da home e shell compartilhado.
- `source/products.json`: catálogo e preços em centavos; o JSON incorporado na home deve acompanhar esse arquivo.
- `source/storefront.css`: fundação visual extraída dos antigos blocos inline, na ordem original.
- `source/enhancements.css`, `product-pages.css`, `campaigns.css` e `checkout-orders.css`: componentes e estados.
- `source/navigation-layout.css`: regras finais de menu e coleções, preservando sua prioridade histórica.
- `scripts/build.mjs`: compila esses seis módulos, nessa ordem, em um único `public/storefront.css`. `scripts/styles.mjs` elimina apenas declarações repetidas comprovadamente equivalentes, mantendo fallbacks, prioridades e condições de mídia. Não remover `!important` em massa; ainda há regras legadas a refatorar mediante comparação visual.
- `scripts/loading.mjs`: gera o CSS crítico da primeira tela, incorporado no HTML, e carrega o CSS completo sem bloquear a renderização; a versão completa mantém a ordem original e há fallback `noscript`. Páginas de perfume incluem os estilos do detalhe no subconjunto crítico. O primeiro banner tem preload apenas no mobile, usando o mesmo `srcset` da imagem.
- `source/icons.json`: somente sete desenhos vetoriais do Font Awesome Free 6.4.0, com autoria/licença preservadas, incorporados como máscaras SVG. Não há download da biblioteca ou das fontes de ícones externas.
- `source/media.json`: imagens responsivas e tamanhos; os originais permanecem preservados. Aventus e Miss Dior também possuem candidatos de 960 px, WebP qualidade 94, para evitar o salto de 640 px ao arquivo original em telas Retina. Resoluções maiores continuam disponíveis; não ampliar uma imagem além do original.
- As tags visíveis são editoriais: “Seleção Sillocta” em Aventus e Miss Dior; “Novidade” em Fame In Love, Teriaq e Irresistible. O estado interno `badge: Novo` também alimenta o filtro de novidades e não representa data de lançamento da fabricante. Não usar alegações de vendas sem dados.

## Vercel e ambientes

Projeto `sillocta`, equipe `celsord8s-projects`. A integração Git cria previews na branch `preview/mercado-pago-orders`; a branch principal é `main`. A produção pode apontar para uma versão promovida anteriormente. Aprovar a prévia não promove automaticamente o domínio oficial.

**O domínio oficial também é uma apresentação.** `configuration()` admite Preview e Production, mas `sandboxSeller()` exige uma conta brasileira de teste (`test_user`, BR/MLB) antes de expor a Public Key ou criar/consultar uma order. O prefixo APP_USR não prova sozinho que a conta é de teste. Uma conta real é bloqueada. Development não habilita o checkout.

Configure `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_PUBLIC_KEY` no ambiente correspondente da Vercel. O Access Token permanece no servidor; a Public Key chega ao navegador pela configuração de runtime. Nunca gravar credenciais em arquivos, commits ou logs.

## Pagamento e entrega

Checkout Transparente com API Orders (`POST /v1/orders`): Pix, cartão via Card Payment Brick e boleto. Os preços, descontos, embalagem de presente e total são calculados no servidor. Cotações e recibos assinados pertencem à sessão HttpOnly; os reenvios mantêm a chave de idempotência. O servidor valida identidade do vendedor, referência, moeda/país e valores antes de confirmar o estado.

Com `MELHOR_ENVIO_TOKEN` e `SHIPPING_ORIGIN_CEP`, o frete é cotado na API do Melhor Envio, incluindo os serviços retornados para o CEP. `MELHOR_ENVIO_CONTACT_EMAIL` é opcional; sem ele, o servidor obtém o contato da conta para o cabeçalho exigido. Pesos e dimensões são estimativas provisórias para pequenos decants; precisam ser medidos antes de vender. Sem token, existem opções de demonstração. Não há compra automática de etiqueta nem postagem.

Teste somente com dados e cartões oficiais de teste do Mercado Pago. Gerar QR Code ou boleto não comprova aprovação. A consulta confirma o estado na API; Pix e boleto podem permanecer pendentes no ambiente de teste. Consulte a [documentação de Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/landing).

## SEO e medição

`PUBLIC_SITE_URL` deve ser uma origem HTTPS sem caminho. Na ausência, usa-se `VERCEL_PROJECT_PRODUCTION_URL`. A compilação cria canonical, Open Graph, metadados de compartilhamento e JSON-LD de WebSite, ProductGroup (variantes de 5 e 10 ml) e breadcrumbs, sem avaliações inventadas. Preview tem `noindex, nofollow`, robots bloqueado e nenhum sitemap; o SEO não deve ser julgado pela nota de indexação da prévia. Production gera sitemap com as 27 URLs canônicas.

Analytics e Speed Insights usam os scripts oficiais de primeira parte da Vercel, carregados após o período inicial de renderização. Respeitam Do Not Track/Global Privacy Control, removem query e fragmento dos URLs enviados e não recebem campos de checkout nem eventos personalizados. Habilitar os recursos no plano já existente do projeto; não ativar upgrades pagos. A coleta só começa na versão que inclui os scripts. Métricas de laboratório não equivalem a dados reais de visitantes; Safari/iPhone físico exige verificação separada.

## Limites antes de vendas reais

Esta versão não possui banco persistente de pedidos/clientes, webhooks autenticados de confirmação, gestão de estoque nem expedição. A consulta ocorre no checkout; a aprovação não depende de um retorno ou callback não verificado. O limitador em memória é complementar e não distribuído. A mudança para vendas reais exige essas funções, medição das embalagens, revisão de credenciais e validação de pagamentos reais em uma entrega separada.
