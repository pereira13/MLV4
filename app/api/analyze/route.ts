import { NextResponse } from "next/server";
import {
  AuditAttribute,
  Keyword,
  MLAttributeDefinition,
  MLCategory,
  MLCategoryPrediction,
  MLDescription,
  MLItem,
  MLSearchResponse,
  TechnicalSpecAttribute
} from "@/lib/types";

type RequestBody = {
  url?: string;
  title?: string;
  description?: string;
  category?: string;
  features?: string;
};

type ErrorWithStatus = Error & { status?: number };

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractItemId(input: string): string | null {
  const match = input.match(/\b(MLB|MLA|MLM|MLC|MCO|MPE|MLU|MEC)[-_]?(\d{6,})\b/i);
  return match ? `${match[1].toUpperCase()}${match[2]}` : null;
}

async function mlGet<T>(endpoint: string, token: string): Promise<T> {
  const response = await fetch(`https://api.mercadolibre.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    const error = new Error(`Mercado Livre ${response.status}: ${text.slice(0, 500)}`) as ErrorWithStatus;
    error.status = response.status;
    throw error;
  }

  return response.json() as Promise<T>;
}

function attributesToText(attributes?: { name?: string; value_name?: string }[]): string {
  return (attributes || [])
    .filter((a) => a.name && a.value_name)
    .map((a) => `${a.name}: ${a.value_name}`)
    .join("\n");
}

function getCurrentAttributes(item: MLItem | null): Map<string, { name: string; value: string }> {
  const map = new Map<string, { name: string; value: string }>();
  for (const a of item?.attributes || []) {
    if (a.id && a.name && a.value_name) {
      map.set(a.id.toUpperCase(), { name: a.name, value: a.value_name });
    }
  }
  return map;
}

function isTruthyTag(tags: Record<string, unknown> | undefined, key: string): boolean {
  return Boolean(tags?.[key]);
}

function pickRequiredDefinitions(definitions: MLAttributeDefinition[]): MLAttributeDefinition[] {
  return definitions.filter((d) => isTruthyTag(d.tags, "required"));
}

function pickRankingDefinitions(definitions: MLAttributeDefinition[]): MLAttributeDefinition[] {
  return definitions.filter((d) =>
    isTruthyTag(d.tags, "required") ||
    isTruthyTag(d.tags, "catalog_required") ||
    isTruthyTag(d.tags, "read_only") === false
  );
}

function extractTechnicalSpecAttributes(input: unknown): TechnicalSpecAttribute[] {
  const result: TechnicalSpecAttribute[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const record = node as Record<string, unknown>;

    if (Array.isArray(record.attributes)) {
      for (const raw of record.attributes) {
        if (!raw || typeof raw !== "object") continue;
        const attr = raw as Record<string, unknown>;
        const id = typeof attr.id === "string" ? attr.id : "";
        const name = typeof attr.name === "string" ? attr.name : "";
        if (!id || !name || seen.has(id)) continue;
        seen.add(id);
        result.push({
          id,
          name,
          relevance: typeof attr.relevance === "number" ? attr.relevance : undefined,
          tags: typeof attr.tags === "object" && attr.tags ? (attr.tags as Record<string, unknown>) : undefined
        });
      }
    }

    for (const value of Object.values(record)) {
      if (value && typeof value === "object") walk(value);
    }
  };

  walk(input);
  return result;
}

function buildKeywords(text: string, competitorText: string): Keyword[] {
  const stop = new Set([
    "para", "com", "sem", "uma", "um", "de", "da", "do", "das", "dos",
    "e", "ou", "em", "no", "na", "nos", "nas", "por", "que", "produto",
    "original", "novo", "nova", "mercado", "livre", "venda", "kit", "peca",
    "pecas", "the", "and", "mais", "melhor", "oficial", "promocao"
  ]);

  const words = normalize(text)
    .split(" ")
    .filter((w) => w.length >= 3 && !stop.has(w) && !/^\d+$/.test(w));

  const freq = new Map<string, number>();
  for (const word of words) freq.set(word, (freq.get(word) || 0) + 1);

  const competitorFreq = new Map<string, number>();
  for (const word of normalize(competitorText).split(" ")) {
    if (word.length >= 3 && !stop.has(word)) competitorFreq.set(word, (competitorFreq.get(word) || 0) + 1);
  }

  const ranked = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
  const result: Keyword[] = ranked.map(([term, count], i) => {
    const competitorBoost = Math.min((competitorFreq.get(term) || 0) * 3, 10);
    const score = Math.max(52, Math.min(98, 88 - i * 1.7 + count * 2 + competitorBoost));
    const type: Keyword["type"] = i === 0 ? "principal" : i < 6 ? "secundaria" : "related";
    return {
      term,
      score: Math.round(score),
      type,
      intent: "transacional",
      suggestedPlacement: i < 3 ? ["Título", "Características"] : ["Descrição", "Características"]
    };
  });

  const longTailCandidates = [
    [result[0]?.term, result[1]?.term].filter(Boolean).join(" "),
    [result[0]?.term, result[2]?.term].filter(Boolean).join(" "),
    [result[0]?.term, result[3]?.term].filter(Boolean).join(" ")
  ].filter((v, idx, arr) => v && arr.indexOf(v) === idx && v.split(" ").length >= 2);

  for (const term of longTailCandidates) {
    if (!result.some((k) => k.term === term)) {
      result.push({
        term,
        score: Math.round(Math.min(95, (result[0]?.score || 75) - 2)),
        type: "long-tail",
        intent: "transacional",
        suggestedPlacement: ["Título opcional", "Descrição"]
      });
    }
  }

  return result.slice(0, 30);
}

function makeAttributeAudit(
  definitions: MLAttributeDefinition[],
  technicalDefinitions: TechnicalSpecAttribute[],
  current: Map<string, { name: string; value: string }>
): AuditAttribute[] {
  const byId = new Map<string, MLAttributeDefinition>();
  for (const definition of definitions) {
    if (definition.id) byId.set(definition.id.toUpperCase(), definition);
  }

  const audits: AuditAttribute[] = [];
  const seen = new Set<string>();

  for (const definition of definitions) {
    if (!definition.id || !definition.name) continue;
    const id = definition.id.toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);

    const cur = current.get(id);
    const required = isTruthyTag(definition.tags, "required");

    audits.push({
      id: definition.id,
      name: definition.name,
      status: cur ? "filled" : required ? "missing" : "recommended",
      required,
      rankingImpact: required,
      currentValue: cur?.value,
      reason: cur
        ? "Atributo já preenchido no anúncio."
        : required
        ? "Atributo exigido pela categoria e ausente no anúncio."
        : "Atributo disponível na categoria que pode aumentar a completude do anúncio."
    });
  }

  for (const technical of technicalDefinitions) {
    if (!technical.id || !technical.name) continue;
    const id = technical.id.toUpperCase();
    if (seen.has(id) || byId.has(id)) continue;
    const cur = current.get(id);

    audits.push({
      id: technical.id,
      name: technical.name,
      status: cur ? "filled" : "recommended",
      required: false,
      rankingImpact: true,
      currentValue: cur?.value,
      reason: cur
        ? "Atributo técnico já informado."
        : "Atributo técnico disponível para a categoria; o preenchimento pode afetar a qualidade/completude de busca."
    });
  }

  return audits
    .sort((a, b) => {
      const weight = (x: AuditAttribute) => x.status === "missing" ? 0 : x.status === "recommended" ? 1 : 2;
      return weight(a) - weight(b) || Number(b.required) - Number(a.required) || a.name.localeCompare(b.name);
    })
    .slice(0, 50);
}

function buildOpportunities(
  title: string,
  description: string,
  features: string,
  category: string,
  attributeAudit: AuditAttribute[],
  keywords: Keyword[],
  competitorsCount: number
) {
  const opportunities: { priority: "alta" | "média" | "baixa"; area: string; problem: string; action: string; copyReady?: string }[] = [];

  const requiredMissing = attributeAudit.filter((x) => x.status === "missing");
  const recommendedMissing = attributeAudit.filter((x) => x.status === "recommended");

  for (const attribute of requiredMissing.slice(0, 8)) {
    opportunities.push({
      priority: "alta",
      area: "Ficha técnica",
      problem: `O atributo “${attribute.name}” está ausente.`,
      action: `Preencher “${attribute.name}” com o valor real do produto.`,
      copyReady: `${attribute.name}: [informar valor real]`
    });
  }

  for (const attribute of recommendedMissing.slice(0, 5)) {
    opportunities.push({
      priority: "média",
      area: "Ficha técnica",
      problem: `O anúncio não informa “${attribute.name}”.`,
      action: `Adicionar esse atributo se ele realmente se aplicar ao produto.`,
      copyReady: `${attribute.name}: [informar valor real, se aplicável]`
    });
  }

  if (!title) {
    opportunities.push({
      priority: "alta",
      area: "Título",
      problem: "O anúncio não possui título suficiente para análise.",
      action: "Criar um título objetivo com produto + marca/modelo + especificação comprovada."
    });
  } else if (title.length > 70) {
    opportunities.push({
      priority: "média",
      area: "Título",
      problem: "O título está muito extenso para uma leitura rápida.",
      action: "Retirar termos repetidos e manter produto, marca/modelo e especificações relevantes."
    });
  }

  if (!description || description.length < 180) {
    opportunities.push({
      priority: "alta",
      area: "Descrição",
      problem: "A descrição está vazia ou curta para explicar o produto.",
      action: "Adicionar benefícios, aplicações, especificações, compatibilidade e conteúdo da embalagem somente com dados confirmados."
    });
  }

  if (!features || features.split("\n").filter(Boolean).length < 3) {
    opportunities.push({
      priority: "média",
      area: "Características",
      problem: "Poucas características foram encontradas.",
      action: "Completar a ficha técnica com os atributos reais disponíveis para a categoria."
    });
  }

  if (!category) {
    opportunities.push({
      priority: "alta",
      area: "Categoria",
      problem: "A categoria não foi identificada.",
      action: "Confirmar a categoria sugerida pelo preditor antes de alterar o anúncio."
    });
  }

  if (keywords.length === 0) {
    opportunities.push({
      priority: "alta",
      area: "Palavras-chave",
      problem: "Não há dados suficientes para construir um conjunto confiável de termos.",
      action: "Completar o cadastro do produto e repetir a análise."
    });
  }  } else {
    const topMissing = keywords
      .slice(0, 5)
      .filter(
        (k) =>
          !normalize(
            `${title} ${description} ${features}`
          ).includes(k.term)
      );

    if (topMissing.length) {
      opportunities.push({
        priority: "média",
        area: "Palavras-chave",
        problem: `Há ${topMissing.length} termos relevantes que não aparecem claramente no conteúdo atual.`,
        action: `Avaliar o uso natural de: ${topMissing
          .map((k) => k.term)
          .join(", ")}.`
      });
    }
  }

  return opportunities.slice(0, 20);
}

async function runOptionalAI(payload: unknown) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-6-astra";

  const instructions = `Você é um especialista em otimização de anúncios de marketplace. Analise somente os dados fornecidos. Não invente especificações. Se um dado não estiver confirmado, escreva que precisa ser verificado. O objetivo é dizer exatamente o que pode ser colocado para melhorar o anúncio: título, descrição, características, aplicações, compatibilidades e termos. Não prometa ranking, vendas ou conversão. Retorne JSON válido com as chaves: summary, titleSuggestions (array de 3 strings), descriptionSuggestion, topKeywords (array), missingInformation (array de objetos com field, why, suggestion), priorities (array de objetos com priority, area, action).`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      instructions,
      input: JSON.stringify(payload),
      text: {
        format: {
          type: "json_object"
        }
      },
      max_output_tokens: 3500
    })
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`IA ${response.status}: ${text.slice(0, 400)}`);
  }

  const data = await response.json() as { output_text?: string };
  if (!data.output_text) return null;

  try {
    return JSON.parse(data.output_text);
  } catch {
    return { summary: data.output_text };
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const url = body.url?.trim() || "";
    const token = process.env.MERCADOLIVRE_ACCESS_TOKEN?.trim() || "";

    if (!url && !body.title && !body.description && !body.features) {
      return NextResponse.json({ error: "Cole uma URL do Mercado Livre ou informe os dados do produto." }, { status: 400 });
    }

    let item: MLItem | null = null;
    let itemId = "";
    let source = "manual";
    let title = body.title?.trim() || "";
    let description = body.description?.trim() || "";
    let category = body.category?.trim() || "";
    let features = body.features?.trim() || "";
    let predictedCategory: MLCategoryPrediction | null = null;
    let categoryData: MLCategory | null = null;
    let categoryDefinitions: MLAttributeDefinition[] = [];
    let technicalDefinitions: TechnicalSpecAttribute[] = [];

    const competitors: { id: string; title: string; price: number | null; permalink: string }[] = [];

    if (url) {
      itemId = extractItemId(url) || "";
      if (!itemId) {
        return NextResponse.json({ error: "Não consegui identificar o ID do anúncio nessa URL. Cole a URL completa do Mercado Livre." }, { status: 400 });
      }

      if (!token) {
        return NextResponse.json({
          error: `O anúncio ${itemId} foi identificado, mas MERCADOLIVRE_ACCESS_TOKEN ainda não foi configurado na Vercel.`
        }, { status: 401 });
      }

      item = await mlGet<MLItem>(`/items/${itemId}`, token);
      source = "mercadolivre";
      title = item.title || title;
      features = attributesToText(item.attributes) || features;

      try {
        const desc = await mlGet<MLDescription>(`/items/${itemId}/description`, token);
        description = desc.plain_text || description;
      } catch {
        // Anúncios sem descrição continuam sendo analisados.
      }

      if (item.category_id) {
        try {
          categoryData = await mlGet<MLCategory>(`/categories/${item.category_id}`, token);
          category = categoryData.path_from_root?.map((x) => x.name).filter(Boolean).join(" > ") || categoryData.name || item.category_id;
        } catch {
          category = category || item.category_id;
        }

        try {
          categoryDefinitions = await mlGet<MLAttributeDefinition[]>(`/categories/${item.category_id}/attributes`, token);
        } catch {
          categoryDefinitions = [];
        }

        try {
          const technicalInput = await mlGet<unknown>(`/categories/${item.category_id}/technical_specs/input`, token);
          technicalDefinitions = extractTechnicalSpecAttributes(technicalInput);
        } catch {
          technicalDefinitions = [];
        }
      }

      if (title) {
        const siteId = item.site_id || itemId.slice(0, 3);
        try {
          const search = await mlGet<MLSearchResponse>(`/sites/${siteId}/search?q=${encodeURIComponent(title)}&limit=10`, token);
          for (const result of search.results || []) {
            if (!result.id || result.id === itemId) continue;
            competitors.push({
              id: result.id,
              title: result.title || "Anúncio concorrente",
              price: typeof result.price === "number" ? result.price : null,
              permalink: result.permalink || ""
            });
            if (competitors.length >= 8) break;
          }
        } catch {
          // A análise continua sem concorrentes.
        }
      }
    }

    if (!category && title && token) {
      try {
        const siteId = item?.site_id || "MLB";
        const predictions = await mlGet<MLCategoryPrediction[]>(
          `/sites/${siteId}/domain_discovery/search?limit=3&q=${encodeURIComponent(title)}`,
          token
        );
        predictedCategory = predictions?.[0] || null;
        if (!category && predictedCategory?.category_name) {
          category = predictedCategory.category_name;
        }
      } catch {
        predictedCategory = null;
      }
    }

    const currentAttributes = getCurrentAttributes(item);
    const attributeAudit = makeAttributeAudit(categoryDefinitions, technicalDefinitions, currentAttributes);

    const baseText = [title, category, features, description].filter(Boolean).join(" ");
    const competitorText = competitors.map((x) => x.title).join(" ");
    const keywords = buildKeywords(baseText, competitorText);

    const titleScore = !title
      ? 25
      : Math.min(100, Math.round(50 + Math.min(title.length, 70) / 2 + (keywords[0] && normalize(title).includes(keywords[0].term) ? 18 : 0)));
    const descriptionScore = !description ? 20 : Math.min(100, Math.round(50 + Math.min(description.length / 120, 40)));
    const featureCount = features.split("\n").filter((x) => x.trim()).length;
    const featureScore = !features ? 20 : Math.min(100, 45 + featureCount * 6);
    const requiredMissingCount = attributeAudit.filter((a) => a.status === "missing" && a.required).length;
    const technicalMissingCount = attributeAudit.filter((a) => a.status !== "filled" && a.rankingImpact).length;

    const relevanceScore = Math.max(40, Math.min(100, 85 - requiredMissingCount * 8 - Math.min(technicalMissingCount, 6) * 2));

    const score = Math.max(0, Math.min(100, Math.round(
      titleScore * 0.30 +
      descriptionScore * 0.18 +
      featureScore * 0.18 +
      relevanceScore * 0.24 +
      (competitors.length ? 88 : 60) * 0.10
    )));

    const mainKeyword = keywords[0]?.term || normalize(title).split(" ")[0] || "produto";
    let optimizedTitle = title || `${mainKeyword} produto`;
    if (title && !normalize(title).startsWith(mainKeyword)) {
      optimizedTitle = `${mainKeyword} ${title}`.replace(/\s+/g, " ").trim();
    }

    const opportunities = buildOpportunities(
      title,
      description,
      features,
      category,
      attributeAudit,
      keywords,
      competitors.length
    );

    let ai = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        ai = await runOptionalAI({
          item: {
            id: itemId,
            title,
            description,
            category,
            features,
            price: item?.price ?? null
          },
          attributes: attributeAudit.slice(0, 40),
          keywords: keywords.slice(0, 15),
          competitors: competitors.slice(0, 8).map((c) => ({ title: c.title, price: c.price })),
          opportunities: opportunities.slice(0, 15)
        });
      } catch (error) {
        console.error("IA falhou:", error);
      }
    }

    return NextResponse.json({
      success: true,
      source,
      itemId,
      product: {
        id: item?.id || itemId,
        url: item?.permalink || url,
        title: title || "Produto informado manualmente",
        category: category || "Não identificada",
        price: item?.price ?? null,
        currency: item?.currency_id ?? null,
        pictures: item?.pictures || [],
        condition: item?.condition || null,
        soldQuantity: item?.sold_quantity ?? null
      },
      seo: {
        score,
        scores: {
          title: titleScore,
          description: descriptionScore,
          characteristics: featureScore,
          relevance: relevanceScore
        }
      },
      keywords,
      attributeAudit,
      opportunities,
      recommended: {
        title: ai?.titleSuggestions?.[0] || optimizedTitle,
        titleOptions: ai?.titleSuggestions || [
          optimizedTitle,
          `${mainKeyword} ${title}`.replace(/\s+/g, " ").trim(),
          `${mainKeyword} ${keywords.slice(1, 3).map((k) => k.term).join(" ")} ${title}`.replace(/\s+/g, " ").trim()
        ],
        description:
          ai?.descriptionSuggestion ||
          description ||
          `Descreva o produto ${title || mainKeyword} com suas características, aplicações, compatibilidades e especificações técnicas reais.`,
        aiSummary: ai?.summary || null
      },
      competitors: competitors.map((c, index) => ({
        id: c.id,
        title: c.title,
        price: c.price,
        permalink: c.permalink,
        similarityScore: Math.max(60, 94 - index * 5)
      })),
      categoryPrediction: predictedCategory,
      warnings: [
        ...(requiredMissingCount > 0 ? [`Existem ${requiredMissingCount} atributos obrigatórios ausentes na ficha técnica.`] : []),
        ...(technicalMissingCount > 0 ? [`Existem ${technicalMissingCount} atributos técnicos não preenchidos que merecem verificação.`] : []),
        "Nenhuma informação desconhecida deve ser inventada para melhorar SEO.",
        "A pontuação é uma heurística de auditoria e não representa uma garantia de posicionamento no Mercado Livre."
      ]
    });
  } catch (error) {
    console.error("Erro na análise:", error);
    const err = error as ErrorWithStatus;

    if (err.status === 401) {
      return NextResponse.json({ error: "Access Token do Mercado Livre inválido ou não autorizado." }, { status: 401 });
    }

    if (err.status === 404) {
      return NextResponse.json({ error: "Anúncio não encontrado no Mercado Livre." }, { status: 404 });
    }

    return NextResponse.json({
      error: error instanceof Error ? error.message : "Erro interno ao analisar o anúncio."
    }, { status: 500 });
  }
}
