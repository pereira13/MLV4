export type MLAttribute = {
  id?: string;
  name?: string;
  value_name?: string;
  value_id?: string;
  tags?: Record<string, unknown>;
};

export type MLItem = {
  id: string;
  site_id?: string;
  title?: string;
  category_id?: string;
  domain_id?: string;
  permalink?: string;
  price?: number;
  currency_id?: string;
  available_quantity?: number;
  sold_quantity?: number;
  pictures?: { id?: string; url?: string; secure_url?: string }[];
  attributes?: MLAttribute[];
  tags?: string[];
  listing_type_id?: string;
  condition?: string;
  catalog_product_id?: string | null;
  shipping?: Record<string, unknown>;
  variations?: unknown[];
};

export type MLCategory = {
  id?: string;
  name?: string;
  path_from_root?: { id?: string; name?: string }[];
  children_categories?: { id: string; name: string }[];
};

export type MLAttributeDefinition = {
  id?: string;
  name?: string;
  value_type?: string;
  value_max_length?: number;
  tags?: Record<string, unknown>;
  hierarchy?: string;
  relevance?: number;
  values?: { id?: string; name?: string }[];
  attribute_group_id?: string;
  attribute_group_name?: string;
};

export type MLSearchedItem = {
  id?: string;
  title?: string;
  price?: number;
  permalink?: string;
  thumbnail?: string;
  category_id?: string;
};

export type MLSearchResponse = { results?: MLSearchedItem[] };

export type MLDescription = { plain_text?: string };

export type MLCategoryPrediction = {
  domain_id?: string;
  domain_name?: string;
  category_id?: string;
  category_name?: string;
  attributes?: MLAttribute[];
};

export type TechnicalSpecAttribute = {
  id?: string;
  name?: string;
  relevance?: number;
  tags?: Record<string, unknown>;
};

export type AuditAttribute = {
  id: string;
  name: string;
  status: "filled" | "missing" | "recommended";
  required: boolean;
  rankingImpact: boolean;
  currentValue?: string;
  reason: string;
};

export type Keyword = {
  term: string;
  score: number;
  type: "principal" | "secundaria" | "long-tail" | "related" | "competitor";
  intent: "transacional" | "comercial" | "informacional";
  suggestedPlacement: string[];
};

export type Opportunity = {
  priority: "alta" | "média" | "baixa";
  area: string;
  problem: string;
  action: string;
  copyReady?: string;
};
