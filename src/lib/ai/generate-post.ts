import { createJsonCompletion } from "@/lib/ai/openai-compatible";

export type StyleOption = {
  id: string;
  name: string;
  category: string;
  mood: string;
  description: string;
  usageRules: string;
  colorNotes: string;
  layoutNotes: string;
  suggestedTopics: string[];
  suggestedFigures: string[];
};

export type RecentPostSummary = {
  topic: string;
  figureName: string;
  intention: string;
  createdAt: string;
};

export type StrategyInput = {
  brandTone: string;
  topicHint: string;
  figureHint: string;
  intentionHint: string;
  lengthPreference: "short" | "medium" | "long";
  styleMode: "automatic" | "manual";
  manualStyle?: StyleOption | null;
  availableStyles: StyleOption[];
  recentPosts: RecentPostSummary[];
  additionalInstructions: string;
};

export type StrategyResult = {
  topic: string;
  figure_name: string;
  intention: string;
  tone: string;
  visual_mood: string;
  selected_style_id: string | null;
  selected_style_reason: string;
  selected_style_confidence: number;
  content_brief: string;
};

export type ContentInput = {
  brandTone: string;
  lengthPreference: "short" | "medium" | "long";
  strategy: StrategyResult;
  selectedStyle: StyleOption | null;
  additionalInstructions: string;
};

export type ContentResult = {
  eyebrow: string;
  title: string;
  subtitle: string;
  prayer: string;
  caption: string;
  cta: string;
  hashtags: string[];
};

function formatStyles(styles: StyleOption[]) {
  if (styles.length === 0) return "No hay estilos disponibles.";

  return styles
    .map((style, index) => {
      return `${index + 1}. ${style.name}\nID: ${style.id}\nCategoría: ${style.category}\nMood: ${style.mood || "—"}\nDescripción: ${style.description || "—"}\nColores: ${style.colorNotes || "—"}\nComposición: ${style.layoutNotes || "—"}\nReglas: ${style.usageRules || "—"}\nTemas sugeridos: ${style.suggestedTopics.join(", ") || "—"}\nFiguras sugeridas: ${style.suggestedFigures.join(", ") || "—"}`;
    })
    .join("\n\n");
}

function formatRecentPosts(posts: RecentPostSummary[]) {
  if (posts.length === 0) return "No hay publicaciones recientes.";

  return posts
    .map(
      (post, index) =>
        `${index + 1}. Tema: ${post.topic || "—"} | Figura: ${post.figureName || "—"} | Intención: ${post.intention || "—"} | Fecha: ${post.createdAt}`,
    )
    .join("\n");
}

export async function generateStrategy(input: StrategyInput) {
  const system = `Eres el estratega editorial de Ecos del Alma, una página de contenido devocional en español.
Tu tarea es decidir una estrategia breve y útil para una nueva publicación.
Debes evitar repeticiones recientes, mantener un tono respetuoso y escoger el mejor estilo visual si el modo de referencia es automático.
Devuelve únicamente JSON válido con las claves exactas solicitadas.`;

  const user = `CONFIGURACIÓN\nTono de marca: ${input.brandTone}\nLongitud preferida: ${input.lengthPreference}\nModo de referencia: ${input.styleMode}\n\nPISTAS DEL USUARIO\nTema sugerido: ${input.topicHint || "Automático"}\nFigura sugerida: ${input.figureHint || "Automática"}\nIntención sugerida: ${input.intentionHint || "Automática"}\nInstrucciones adicionales: ${input.additionalInstructions || "Ninguna"}\n\nESTILOS DISPONIBLES\n${formatStyles(input.availableStyles)}\n\nESTILO MANUAL (si aplica)\n${input.manualStyle ? `${input.manualStyle.name} (${input.manualStyle.id})` : "No aplica"}\n\nPUBLICACIONES RECIENTES\n${formatRecentPosts(input.recentPosts)}\n\nDevuelve un objeto JSON con estas claves exactas:
{
  "topic": "string",
  "figure_name": "string",
  "intention": "string",
  "tone": "string",
  "visual_mood": "string",
  "selected_style_id": "uuid o null",
  "selected_style_reason": "string",
  "selected_style_confidence": 0.0,
  "content_brief": "string"
}

REGLAS:
- Si el modo de referencia es manual, selected_style_id debe ser el del estilo manual.
- Si el modo de referencia es automático, selected_style_id debe corresponder a uno de los estilos disponibles.
- selected_style_confidence debe ser un número entre 0 y 1.
- content_brief debe resumir la intención del texto en una línea.
- No uses lenguaje polémico, apocalíptico ni sensacionalista.`;

  const { parsed, model } = await createJsonCompletion<StrategyResult>({
    system,
    user,
    temperature: 0.45,
  });

  return { result: parsed, model };
}

export async function generatePrayerContent(input: ContentInput) {
  const system = `Eres un redactor devocional de alta calidad para Ecos del Alma.
Escribes oraciones originales en español, cálidas, respetuosas, claras y visualmente viables para una publicación en Facebook.
Devuelve únicamente JSON válido con las claves solicitadas.`;

  const lengthGuide =
    input.lengthPreference === "short"
      ? "Oración breve: 80 a 110 palabras."
      : input.lengthPreference === "long"
        ? "Oración amplia: 170 a 220 palabras."
        : "Oración media: 120 a 160 palabras.";

  const user = `TONO DE MARCA\n${input.brandTone}\n\nESTRATEGIA\nTema: ${input.strategy.topic}\nFigura: ${input.strategy.figure_name}\nIntención: ${input.strategy.intention}\nTono: ${input.strategy.tone}\nMood visual: ${input.strategy.visual_mood}\nResumen: ${input.strategy.content_brief}\n\nESTILO VISUAL SELECCIONADO\n${input.selectedStyle ? `${input.selectedStyle.name} | ${input.selectedStyle.category} | ${input.selectedStyle.mood}` : "No definido"}\n\nLONGITUD\n${lengthGuide}\n\nINSTRUCCIONES ADICIONALES\n${input.additionalInstructions || "Ninguna"}\n\nDevuelve un JSON con estas claves exactas:
{
  "eyebrow": "string",
  "title": "string",
  "subtitle": "string",
  "prayer": "string",
  "caption": "string",
  "cta": "string",
  "hashtags": ["#...", "#..."]
}

REGLAS:
- Escribe todo en español.
- eyebrow debe ser corto, por ejemplo: "Oración a".
- title normalmente será el nombre principal de la figura o advocación.
- subtitle debe comenzar naturalmente con "por..." o tener sentido similar.
- prayer debe cerrar con "Amén.".
- caption debe ser publicable en Facebook y no repetir palabra por palabra toda la oración.
- cta debe ser breve y sutil.
- hashtags entre 3 y 6.
- No inventes citas bíblicas literales.
- No uses comillas innecesarias.`;

  const { parsed, model } = await createJsonCompletion<ContentResult>({
    system,
    user,
    temperature: 0.75,
  });

  return { result: parsed, model };
}
