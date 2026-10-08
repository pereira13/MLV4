"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
  Target,
  Trophy,
  XCircle
} from "lucide-react";

type AttributeAudit = {
  id: string;
  name: string;
  status: "filled" | "missing" | "recommended";
  required: boolean;
  rankingImpact: boolean;
  currentValue?: string;
  reason: string;
};

type Keyword = {
  term: string;
  score: number;
  type: string;
  intent: string;
  suggestedPlacement: string[];
};

type Opportunity = {
  priority: "alta" | "média" | "baixa";
  area: string;
  problem: string;
  action: string;
  copyReady?: string;
};

type Competitor = {
  id: string;
  title: string;
  price: number | null;
  permalink: string;
  similarityScore: number;
};

type Result = {
  source: string;
  itemId: string;
  product: {
    id: string;
    url: string;
    title: string;
    category: string;
    price: number | null;
    currency: string | null;
    soldQuantity?: number | null;
    condition?: string | null;
    pictures: { url?: string; secure_url?: string }[];
  };
  seo: {
    score: number;
    scores: {
      title: number;
      description: number;
      characteristics: number;
      relevance: number;
    };
  };
  keywords: Keyword[];
  attributeAudit: AttributeAudit[];
  opportunities: Opportunity[];
  recommended: {
    title: string;
    titleOptions: string[];
    description: string;
    aiSummary: string | null;
  };
  competitors: Competitor[];
  categoryPrediction: unknown;
  warnings: string[];
};

function scoreClass(score: number) {
  if (score >= 80) return "good";
  if (score >= 60) return "medium";
  return "bad";
}

function money(value: number | null) {
  if (typeof value !== "number") return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}

export default function Analyzer() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [showAllAttributes, setShowAllAttributes] = useState(false);

  async function analyze() {
    setLoading(true);
    setError("");
    setResult(null);
    setShowAllAttributes(false);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Não foi possível analisar o anúncio.");
      }

      setResult(data);
      setTimeout(() => {
        document.getElementById("resultado")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(""), 1600);
  }

  const missing = result?.attributeAudit.filter((x) => x.status === "missing") || [];
  const recommended = result?.attributeAudit.filter((x) => x.status === "recommended") || [];
  const shownAttributes = result
    ? (showAllAttributes ? result.attributeAudit : result.attributeAudit.slice(0, 12))
    : [];

  return (
    <main>
      <header className="topbar">
        <div className="brand">
          <div className="brandIcon"><Sparkles size={18} /></div>
          <strong>ML SEO Analyzer</strong>
        </div>
        <nav>
          <a href="#analisar">Analisar</a>
          <a href="#resultado">Diagnóstico</a>
          <a href="#como">Como funciona</a>
        </nav>
        <button className="ghostBtn" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          Nova análise
        </button>
      </header>

      <section className="hero" id="analisar">
        <div className="pill"><Sparkles size={14} /> Auditor de anúncios do Mercado Livre</div>
        <h1>Descubra <span>o que colocar</span><br />para melhorar seu anúncio.</h1>
        <p>
          Cole o link de qualquer anúncio do Mercado Livre. O sistema identifica o que já existe,
          o que está faltando e o que pode ser melhorado — com sugestões prontas para copiar.
        </p>

        <div className="urlSearch">
          <Search size={20} />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void analyze(); }}
            placeholder="Cole aqui a URL do anúncio do Mercado Livre..."
          />
          <button onClick={() => void analyze()} disabled={loading || !url.trim()}>
            {loading ? <><RefreshCw size={17} className="spin" /> Analisando</> : <><Sparkles size={17} /> Analisar anúncio</>}
          </button>
        </div>

        <div className="heroChecks">
          <span>✓ Título</span>
          <span>✓ Descrição</span>
          <span>✓ Ficha técnica</span>
          <span>✓ Categoria</span>
          <span>✓ Concorrentes</span>
          <span>✓ Palavras-chave</span>
        </div>

        {error && <div className="error heroError"><AlertTriangle size={17} /><span>{error}</span></div>}
      </section>

      {result && (
        <section className="results" id="resultado">
          <div className="resultTop">
            <div>
              <span className="eyebrow">ANÚNCIO ANALISADO</span>
              <h2>{result.product.title}</h2>
              <p>{result.product.category}</p>
              <div className="metaLine">
                {result.itemId && <span>ID: <b>{result.itemId}</b></span>}
                {result.product.price !== null && <span>Preço: <b>{money(result.product.price)}</b></span>}
                {result.product.soldQuantity !== null && result.product.soldQuantity !== undefined && <span>Vendas: <b>{result.product.soldQuantity}</b></span>}
              </div>
              {result.product.url && <a href={result.product.url} target="_blank" rel="noreferrer" className="openLink">Abrir anúncio <ExternalLink size={13} /></a>}
            </div>
            <div className={`bigScore ${scoreClass(result.seo.score)}`}>
              <small>SEO SCORE</small>
              <strong>{result.seo.score}</strong>
              <span>/100</span>
            </div>
          </div>

          <div className="scoreGrid">
            {[
              { name: "Título", value: result.seo.scores.title, Icon: FileText },
              { name: "Descrição", value: result.seo.scores.description, Icon: FileText },
              { name: "Características", value: result.seo.scores.characteristics, Icon: Tags },
              { name: "Relevância", value: result.seo.scores.relevance, Icon: Target }
            ].map(({ name, value, Icon }) => (
              <div className="metric" key={name}>
                <Icon size={18} />
                <div><span>{name}</span><b>{value}</b></div>
                <div className="bar"><i style={{ width: `${value}%` }} /></div>
              </div>
            ))}
          </div>

          <div className="heroDiagnosis">
            <div className="diagnosisIcon"><Target size={20} /></div>
            <div>
              <span className="eyebrow">DIAGNÓSTICO</span>
              <h3>
                {missing.length > 0
                  ? `Encontrei ${missing.length} atributo${missing.length > 1 ? "s" : ""} importante${missing.length > 1 ? "s" : ""} faltando.`
                  : "Não foram encontrados atributos obrigatórios ausentes."}
              </h3>
              <p>
                Abaixo estão as alterações que eu priorizaria para tornar o anúncio mais completo e relevante.
              </p>
            </div>
          </div>

          <div className="panel highlightCard">
            <div className="sectionHead">
              <div>
                <span className="eyebrow">🚀 PRIORIDADE</span>
                <h3>O que eu colocaria neste anúncio</h3>
                <p>Comece por estas alterações. Elas são mais importantes que simplesmente adicionar palavras.</p>
              </div>
            </div>

            <div className="priorityGrid">
              {result.opportunities.slice(0, 8).map((item, i) => (
                <div className={`priority ${item.priority}`} key={`${item.area}-${i}`}>
                  <div className="priorityTop">
                    <span className="priorityNumber">{String(i + 1).padStart(2, "0")}</span>
                    <span className="priorityBadge">{item.priority.toUpperCase()}</span>
                  </div>
                  <b>{item.area}</b>
                  <p>{item.problem}</p>
                  <strong>{item.action}</strong>
                  {item.copyReady && (
                    <div className="copyReady">
                      <code>{item.copyReady}</code>
                      <button onClick={() => void copyText(item.copyReady || "", `op-${i}`)}>
                        {copied === `op-${i}` ? <Check size={15} /> : <Copy size={15} />}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="twoCols">
            <div className="panel sectionCard">
              <div className="sectionHead">
                <div>
                  <span className="eyebrow">🔑 KEYWORD RESEARCH</span>
                  <h3>Termos que você pode trabalhar</h3>
                </div>
                <Tags size={19} />
              </div>
              <div className="keywordTable">
                <div className="thead"><span>Termo</span><span>Tipo</span><span>Score</span><span>Onde</span></div>
                {result.keywords.slice(0, 18).map((keyword) => (
                  <div className="tr" key={keyword.term}>
                    <strong>{keyword.term}</strong>
                    <span>{keyword.type}</span>
                    <b>{keyword.score}</b>
                    <span>{keyword.suggestedPlacement.join(", ")}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="panel sectionCard">
              <div className="sectionHead">
                <div>
                  <span className="eyebrow">📝 TÍTULO</span>
                  <h3>O que eu mudaria no título</h3>
                </div>
                <Trophy size={19} />
              </div>
              {result.recommended.titleOptions.slice(0, 3).map((option, index) => (
                <div className="optionBox" key={`${option}-${index}`}>
                  <span>Opção {index + 1}</span>
                  <p>{option}</p>
                  <button onClick={() => void copyText(option, `title-${index}`)}>
                    {copied === `title-${index}` ? <Check size={15} /> : <Copy size={15} />}
                    {copied === `title-${index}` ? "Copiado" : "Copiar"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel sectionCard">
            <div className="sectionHead">
              <div>
                <span className="eyebrow">⚙️ FICHA TÉCNICA</span>
                <h3>O que está preenchido e o que falta</h3>
                <p>Os atributos são comparados com a categoria do anúncio.</p>
              </div>
              <Tags size={19} />
            </div>

            <div className="attributeSummary">
              <span className="summaryGood"><Check size={15} /> {result.attributeAudit.filter(x => x.status === "filled").length} preenchidos</span>
              <span className="summaryBad"><XCircle size={15} /> {missing.length} ausentes</span>
              <span className="summaryMaybe"><AlertTriangle size={15} /> {recommended.length} recomendados</span>
            </div>

            <div className="attributeTable">
              <div className="attributeHeader"><span>Atributo</span><span>Status</span><span>Valor atual</span><span>Ação</span></div>
              {shownAttributes.map((attribute) => (
                <div className="attributeRow" key={attribute.id}>
                  <div><strong>{attribute.name}</strong>{attribute.required && <small>Obrigatório</small>}</div>
                  <span className={`status ${attribute.status}`}>
                    {attribute.status === "filled" ? "Preenchido" : attribute.status === "missing" ? "Ausente" : "Recomendado"}
                  </span>
                  <span>{attribute.currentValue || "—"}</span>
                  <span>{attribute.status === "filled" ? "Manter" : "Verificar e preencher"}</span>
                </div>
              ))}
            </div>

            {result.attributeAudit.length > 12 && (
              <button className="expandBtn" onClick={() => setShowAllAttributes(!showAllAttributes)}>
                {showAllAttributes ? "Mostrar menos" : "Mostrar todos os atributos"} <ChevronDown size={16} />
              </button>
            )}
          </div>

          <div className="panel sectionCard">
            <div className="sectionHead">
              <div>
                <span className="eyebrow">📄 DESCRIÇÃO</span>
                <h3>Descrição recomendada</h3>
                <p>Use apenas informações verdadeiras e comprovadas do produto.</p>
              </div>
              <button className="copyBtn" onClick={() => void copyText(result.recommended.description, "description")}>
                {copied === "description" ? <Check size={15} /> : <Copy size={15} />}
                {copied === "description" ? "Copiado" : "Copiar descrição"}
              </button>
            </div>
            <div className="descriptionBox">{result.recommended.description}</div>
          </div>

          <div className="panel sectionCard">
            <div className="sectionHead">
              <div>
                <span className="eyebrow">🏆 CONCORRÊNCIA</span>
                <h3>O que anúncios semelhantes estão fazendo</h3>
              </div>
              <BarChart3 size={19} />
            </div>
            {result.competitors.length === 0 ? (
              <div className="empty">A busca não retornou concorrentes para este anúncio.</div>
            ) : (
              <div className="competitorTable">
                {result.competitors.map((competitor) => (
                  <div className="competitorRow" key={competitor.id}>
                    <div>
                      <strong>{competitor.title}</strong>
                      <span>{competitor.id} · {money(competitor.price)}</span>
                    </div>
                    <b>{competitor.similarityScore}/100</b>
                    {competitor.permalink && (
                      <a href={competitor.permalink} target="_blank" rel="noreferrer"><ExternalLink size={15} /></a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {result.recommended.aiSummary && (
            <div className="panel aiBox">
              <div className="aiIcon"><Sparkles size={18} /></div>
              <div>
                <span className="eyebrow">ANÁLISE IA</span>
                <h3>Resumo estratégico</h3>
                <p>{result.recommended.aiSummary}</p>
              </div>
            </div>
          )}

          <div className="panel warningBox">
            <AlertTriangle size={18} />
            <div>
              <strong>Importante</strong>
              {result.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
            </div>
          </div>
        </section>
      )}

      {!result && (
        <section className="emptyState">
          <div className="miniIcon"><Sparkles size={20} /></div>
          <h2>Coloque um link e veja o diagnóstico completo</h2>
          <p>O sistema foi desenhado para responder uma pergunta simples: <b>o que eu devo melhorar ou colocar nesse anúncio?</b></p>
        </section>
      )}

      <section id="como" className="how">
        <span className="eyebrow">COMO FUNCIONA</span>
        <h2>Link → Auditoria → Ação</h2>
        <p>O anúncio é comparado com os atributos da categoria, conteúdo existente, termos relevantes e anúncios semelhantes para montar recomendações práticas.</p>
      </section>

      <footer>
        ML SEO Analyzer · A ferramenta é um apoio de otimização e não garante posicionamento, vendas ou conversão.
      </footer>
    </main>
  );
}
