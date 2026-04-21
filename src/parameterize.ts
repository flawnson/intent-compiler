export type Dialect = "postgresql" | "mysql" | "sqlite";

export type IntentTemplate = {
  kind: "intent_template";
  dialect: Dialect;
  prompt: string;
  placeholderPrompt: string;
  params: unknown[];
};

const DIALECT_PLACEHOLDERS: Record<Dialect, (index: number) => string> = {
  postgresql: (index) => `$${index}`,
  mysql: () => "?",
  sqlite: () => "?"
};

function normalizeDialect(dialect: string): Dialect {
  const normalized = String(dialect || "postgresql").toLowerCase();
  if (normalized === "postgres" || normalized === "postgresql") {
    return "postgresql";
  }
  if (normalized === "mysql") {
    return "mysql";
  }
  if (normalized === "sqlite" || normalized === "sqlite3") {
    return "sqlite";
  }
  throw new Error(`Unsupported dialect: ${dialect}`);
}

export function parameterizeTemplate(
  strings: string[],
  values: unknown[],
  dialect: string = "postgresql"
): IntentTemplate {
  if (!Array.isArray(strings) || !Array.isArray(values)) {
    throw new Error("parameterizeTemplate expects template strings and values arrays.");
  }
  if (strings.length !== values.length + 1) {
    throw new Error("Invalid template input: expected strings.length = values.length + 1.");
  }

  const normalizedDialect = normalizeDialect(dialect);
  const placeholderBuilder = DIALECT_PLACEHOLDERS[normalizedDialect];

  let placeholderPrompt = "";
  for (let index = 0; index < values.length; index += 1) {
    placeholderPrompt += strings[index];
    placeholderPrompt += placeholderBuilder(index + 1);
  }
  placeholderPrompt += strings[values.length];

  const rawPrompt = strings.reduce((acc, piece, index) => {
    if (index >= values.length) {
      return acc + piece;
    }
    return `${acc}${piece}${String(values[index])}`;
  }, "");

  return {
    kind: "intent_template",
    dialect: normalizedDialect,
    prompt: rawPrompt,
    placeholderPrompt,
    params: [...values]
  };
}

export function intent(strings: TemplateStringsArray, ...values: unknown[]): IntentTemplate {
  return parameterizeTemplate([...strings], values, "postgresql");
}
