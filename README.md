# ML SEO Analyzer — Auditor de anúncios

Aplicação Next.js/Vercel para analisar um anúncio do Mercado Livre e responder principalmente: **o que posso colocar, corrigir ou completar para melhorar este anúncio?**

## Fluxo

URL → ITEM_ID → API Mercado Livre → título/descrição/categoria/atributos → atributos da categoria → atributos técnicos com impacto em ranking → concorrentes → keywords → diagnóstico → prioridades → sugestões prontas para copiar.

## O que esta versão faz

- Identifica o ITEM_ID em URLs do Mercado Livre.
- Busca o item real pela API do Mercado Livre.
- Lê título, descrição, categoria, preço, vendas, imagens e atributos disponíveis.
- Consulta os atributos da categoria.
- Consulta `technical_specs/input` quando disponível para encontrar atributos técnicos que merecem atenção.
- Detecta atributos preenchidos, ausentes e recomendados.
- Pesquisa anúncios semelhantes.
- Extrai palavras-chave de forma heurística.
- Cria título, descrição, oportunidades e checklist.
- Usa IA opcional para enriquecer a recomendação.

## Variáveis de ambiente

```env
MERCADOLIVRE_ACCESS_TOKEN=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-6-astra
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Rodar

```bash
npm install
npm run dev
```

Depois abra `http://localhost:3000`.

## Vercel

No projeto Vercel, configure as variáveis de ambiente. Para o primeiro teste, configure `MERCADOLIVRE_ACCESS_TOKEN`.

Para habilitar a camada de IA, configure também `OPENAI_API_KEY`. A implementação usa a Responses API no backend; a chave nunca deve ir para o frontend.

## Arquitetura de produção

A versão atual usa um token do Mercado Livre configurado no ambiente apenas como caminho inicial de teste. Em um SaaS multiusuário, implemente OAuth por seller e armazene/renove os tokens por conta.

## Regras de qualidade

- Nunca inventar especificações.
- Se uma informação não for encontrada, mostrar `verificar e preencher`.
- Não prometer primeiro lugar, vendas ou conversão.
- Keywords são sinais de relevância, não garantia de ranking.

## Próximas evoluções

1. OAuth completo por vendedor.
2. Banco de dados e histórico.
3. 20–50 concorrentes por análise.
4. Comparação semântica avançada com embeddings.
5. Monitoramento de mudanças do anúncio.
6. Login e planos SaaS.
7. Exportação em PDF.
8. Auditoria de imagens e checklist visual.
