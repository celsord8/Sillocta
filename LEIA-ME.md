# Sillocta · publicação na Vercel

Este pacote preserva a versão 33 preparada para revisão: visual, tipografia para celular, dois botões flutuantes de coleção, catálogo, filtros, favoritos, páginas de perfumes, seleção de 5/10 ml, sacola e checkout pelo WhatsApp.

As páginas de perfumes são geradas como HTML individual. Assim, abrir um link diretamente ou atualizar a página não depende de um servidor Cloudflare.

Os seletores de quantidade usam ícones discretos, limites de 1 a 99 e botões com área de toque de 44 px. A largura do conteúdo e os títulos são limitados em telas grandes. As duas imagens de coleção são arquivos separados para reduzir o HTML e aproveitar o cache.

No celular, os dois seletores flutuam acima do texto do hero, com colunas iguais e espaçamento próprio. O primeiro toque destaca a coleção; o segundo leva ao início do seu banner, alinhado abaixo da altura real do cabeçalho. A posição é medida após a troca de coleção, e cliques rápidos usam apenas o destino mais recente. O texto do hero permanece visível ao voltar à apresentação; o retorno pela marca preserva o destaque escolhido. Os links do menu continuam levando diretamente às coleções.

Os filtros de marca, preço, disponibilidade, favoritos e ordenação levam aos resultados, alinhados abaixo do cabeçalho. As marcas acompanham a coleção ativa. A área de seleção foi compactada, com campos de 40 px, tipografia discreta e organização adaptada ao celular. A busca por texto mantém o foco durante a digitação.

Os botões de compra usam largura limitada e contorno fino. Os controles de volume, sacola, formas de pagamento e cupom foram compactados; as ações principais mantêm pelo menos 44 px de altura, com espaço para o texto aumentar ou quebrar de linha.

## Publicar

1. Descompacte o ZIP. Use a pasta que contém `package.json` e `vercel.json` como raiz do projeto.
2. Envie essa pasta a um repositório Git e importe-o na Vercel, ou use a Vercel CLI nessa pasta.
3. Em Framework Preset, selecione **Other**. O arquivo `vercel.json` configura o build e a saída automaticamente.
4. Confirme **Build Command: npm run verify**, **Output Directory: public** e **Node.js: 22.x**. Este projeto não precisa de dependências adicionais.
5. Publique e confira a home, o link direto de um perfume, a seleção de volume, a sacola e o WhatsApp em um celular real.

Pela CLI, execute `vercel` para uma publicação de teste. Depois da conferência, execute `vercel --prod`.

Se estiver atualizando um projeto existente, revise configurações antigas de framework e diretório raiz. Suba este pacote completo; um único `index.html` não reproduz as URLs individuais desta exportação.

## Domínio

Os links internos são relativos e acompanham o domínio da implantação. O build usa `VERCEL_PROJECT_PRODUCTION_URL` para as URLs canônicas. Se necessário, configure `PUBLIC_SITE_URL` com a origem HTTPS do domínio definitivo, por exemplo `https://sua-loja.com.br`, e publique novamente.

Referência: https://vercel.com/docs/environment-variables/system-environment-variables

## Checkout

- A sacola e os favoritos usam armazenamento local do navegador. Ao trocar de domínio, os dados do domínio anterior não são transferidos automaticamente.
- O CEP consulta serviços externos para preencher o endereço. A consulta não calcula o frete; o atendimento confirma frete e pagamento pelo WhatsApp.
- Mercado Pago está **desativado** nesta exportação, como na versão aprovada. As rotas para criar pedidos, consultar pagamentos e receber notificações não são implementadas neste pacote estático.
- A base de pagamentos do projeto hospedado em Sites usa Worker e D1 da Cloudflare. Para pagamentos automáticos na Vercel, será necessário adaptar as funções de servidor e o banco persistente, configurar as credenciais privadas no servidor e validar o fluxo com o Mercado Pago. Apenas inserir um Access Token na Vercel não conclui essa adaptação.
- Não coloque credenciais privadas nos arquivos públicos, no HTML ou no JavaScript do navegador.

## Verificação local

Execute `npm run verify` e `npm test`. Os testes verificam as páginas individuais, os recursos referenciados e as interações de catálogo e seleção. Isso não substitui conferir a URL publicada e os serviços externos em um navegador real.

As fontes são carregadas do Google Fonts e os ícones do Font Awesome via CDN, como na versão aprovada. O preenchimento de CEP depende da disponibilidade dos provedores consultados. Portanto, o resultado depende também dessas conexões.

## Plano da Vercel

A Vercel restringe o plano Hobby ao uso pessoal e não comercial. Para operar a Sillocta como loja, use um plano que permita uso comercial, como Pro.

Referência: https://vercel.com/docs/plans/hobby

Este pacote é uma exportação da prévia 33; não altera automaticamente a publicação pública na Vercel.

A faixa com seis imagens oficiais fica diretamente abaixo dos seletores. No celular ela ocupa o hero, antes do texto. Avança a cada 2,4 segundos e aguarda sete segundos após a navegação manual. Permite deslizar por toque, usar os indicadores circulares e navegar por teclado. Pausa quando está fora da tela, com aba oculta, interação ou navegação por teclado. O botão de pausa foi removido. Os números e a linha de progresso foram substituídos por pequenos pontos. A preferência de movimento reduzido desativa o avanço automático. O parágrafo abaixo do título do hero e suas linhas decorativas foram removidos; os espaços entre seletores, imagens e título foram ajustados. As fontes oficiais estão registradas em `source/campaigns.json`.

A prévia 33 acrescenta destaque suave na campanha ativa, arquivos WebP adequados ao tamanho da tela e cache duradouro para arquivos identificados por versão ou conteúdo. As fotografias originais permanecem disponíveis para resoluções maiores. As páginas de perfumes e suas imagens são preparadas ao apontar, focar ou tocar seus links, com limite de três páginas e sem preparação em conexões 2G ou economia de dados. As folhas de estilo carregam no cabeçalho; os scripts locais aguardam o HTML. Esta preparação mantém a produção na Vercel sem alterações.

## Publicação da versão 35

A publicação é condicionada ao sucesso de `npm run verify`. O mesmo conjunto de testes roda no GitHub Actions. O carrossel usa cópias visuais sem IDs duplicados para continuar sempre na mesma direção; cada campanha continua abrindo o perfume correspondente. A troca automática inicia a cada 1,8 segundo e aguarda sete segundos depois de um gesto manual.

Prévia e produção usam o domínio canônico de produção. A prévia não gera sitemap e recebe metadados para não ser indexada. A produção gera um sitemap com a home e as 26 páginas de perfumes.

Para voltar a uma versão já publicada, use o rollback do projeto na Vercel. As alterações de código permanecem no histórico do Git; uma correção ou reversão deve passar pelos mesmos testes. O pedido de configuração não autoriza contratar um plano pago automaticamente.
