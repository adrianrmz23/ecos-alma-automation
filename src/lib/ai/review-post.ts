import { createJsonCompletion } from "@/lib/ai/openai-compatible";

export type QaReviewInput = {
  brandTone: string;
  topic: string;
  figureName: string;
  intention: string;
  styleName: string;
  styleCategory: string;
  styleMood: string;
  styleReason: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  prayerText: string;
  caption: string;
  cta: string;
  hashtags: string[];
  imagePrompt: string;
  hasImage: boolean;
};

export type QaReviewResult = {
  overall_score: number;
  content_score: number;
  brand_score: number;
  visual_score: number;
  recommended_decision: "approve" | "revise";
  summary: string;
  strengths: string[];
  issues: string[];
  recommendations: string[];
};

export async function reviewPostQuality(input: QaReviewInput) {
  const system = `Eres el agente revisor de calidad de Ecos del Alma.
Tu tarea es evaluar si una publicación religiosa está lista para aprobarse antes de programarse.
Evalúa claridad, coherencia de marca, adecuación del estilo y preparación visual.
Devuelve únicamente JSON válido con las claves exactas solicitadas.`;

  const user = `CONTEXTO DE MARCA\nTono de marca: ${input.brandTone}\n\nPUBLICACIÓN\nTema: ${input.topic}\nFigura: ${input.figureName}\nIntención: ${input.intention}\n\nESTILO SELECCIONADO\nNombre: ${input.styleName}\nCategoría: ${input.styleCategory}\nMood: ${input.styleMood}\nMotivo de selección: ${input.styleReason}\n\nCONTENIDO\nEyebrow: ${input.eyebrow}\nTítulo: ${input.title}\nSubtítulo: ${input.subtitle}\nOración: ${input.prayerText}\nCaption: ${input.caption}\nCTA: ${input.cta}\nHashtags: ${input.hashtags.join(" ")}\n\nVISUAL\nHay imagen generada: ${input.hasImage ? "Sí" : "No"}\nPrompt visual usado: ${input.imagePrompt || "No disponible"}\n\nDevuelve un JSON con estas claves exactas:
{
  "overall_score": 0,
  "content_score": 0,
  "brand_score": 0,
  "visual_score": 0,
  "recommended_decision": "approve o revise",
  "summary": "string",
  "strengths": ["string"],
  "issues": ["string"],
  "recommendations": ["string"]
}

REGLAS:
- Usa puntuaciones enteras de 0 a 100.
- recommended_decision debe ser "approve" o "revise".
- overall_score debe reflejar la evaluación general.
- strengths, issues y recommendations deben tener entre 2 y 5 puntos cada uno.
- Si la imagen no existe, recommended_decision debe ser "revise".
- Evalúa la preparación visual según el prompt, el estilo y la existencia de imagen; no inventes análisis pixel-perfect del arte final.
- Sé exigente pero práctica: si está suficientemente bien para una página devocional de Facebook, puedes aprobar.`;

  const { parsed, model } = await createJsonCompletion<QaReviewResult>({
    system,
    user,
    temperature: 0.35,
  });

  return { result: parsed, model };
}
