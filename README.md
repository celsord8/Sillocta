# Sillocta · Checkout Orders em Preview

Versão de teste da loja, com o visual anterior à troca tipográfica preservado (v39; Montserrat e Cormorant Garamond) e Checkout Transparente via `POST /v1/orders`. Inclui Pix, boleto, Card Payment Brick e consulta autenticada do estado do pedido. Publicação somente em branch de Preview; não unir à produção.

## Executar as verificações

`npm ci --ignore-scripts` e `npm run verify` (Node 22). A compilação gera a página inicial e 26 páginas de perfume. As funções privadas ficam em `api/checkout`, fora de `public`.

## Vercel

As variáveis secretas `MERCADO_PAGO_ACCESS_TOKEN` e `MERCADO_PAGO_PUBLIC_KEY` devem existir somente em Preview. O Access Token nunca vai ao navegador. A Public Key é obtida pela configuração pública em tempo de execução, sem gravar seu valor no repositório. O checkout permanece desligado em Production e Development.

Use o par Public Key e Access Token da seção **Teste** da aplicação **Checkout Transparente / API Orders**, ambos com prefixo APP_USR. As chaves legadas TEST não ativam este checkout. O prefixo APP_USR sozinho não distingue teste de produção: antes de abrir a sessão ou criar/consultar um pagamento, o servidor consulta `GET https://api.mercadolibre.com/users/me` com o token privado e exige um usuário brasileiro (`country_id: BR`, `site_id: MLB`) com a tag `test_user`. Uma conta real, identidade incompleta ou falha nessa consulta bloqueia o pagamento. O vendedor de cada order deve corresponder à identidade verificada; a troca de credenciais invalida cotações e recibos antigos. Valores de credenciais e dados privados dessa consulta não são gravados no código, enviados ao navegador ou incluídos nos logs.

## Como testar

Adicione um perfume à sacola. Informe dados fictícios de contato e endereço, aguarde o total calculado no servidor e selecione Pix, cartão ou boleto. O frete é simulado e gratuito, sem promessa de postagem. Não use cartões reais ou dados pessoais.

Cartão oficial de teste Visa: 4235 6477 2802 5682, CVV 123, validade 11/30. Nome APRO e CPF 12345678909 simulam aprovação; OTHE simula recusa. O formulário usa o e-mail oficial de teste test@testuser.com. Pix e boleto usam test_user_br@testuser.com. Pix e boleto podem permanecer pendentes no ambiente de teste; gerar um código não comprova aprovação. A consulta valida diretamente o pedido no Mercado Pago.

Referências: [Cartões](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/cards), [testes](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/cards), [Pix](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix), [boleto](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/boleto).

## Limites desta prévia

Preços, cupom, presente e total são calculados com o catálogo do servidor. Cotações e recibos assinados pertencem à sessão HttpOnly e expiram. Reenvios mantêm a mesma chave de idempotência. Em uma falha sem resposta o navegador bloqueia outro pedido; repetir usa o mesmo corpo e chave. Ao recarregar após uma falha sem recibo, a conferência no painel do vendedor é necessária. Nenhum dado bruto do cartão passa pelo servidor da loja.

Esta prévia não prepara nem expede pedidos. O Mercado Pago guarda o pedido de teste; a loja não dispõe de banco persistente para itens, clientes e atendimento. O limitador em memória é apenas complementar e não é um controle distribuído. Antes de vendas reais serão necessários banco de pedidos, frete real, webhooks autenticados com reconciliação, limites distribuídos e revisão de credenciais de produção. Não ativar produção com este código.
