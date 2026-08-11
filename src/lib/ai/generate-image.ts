import crypto from "node:crypto";

export type ImageStyleContext = {
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

export type ImagePostContext = {
  topic: string;
  figureName: string;
  intention: string;
  selectedStyleReason: string;
};

export type ImageTextContext = {
  eyebrow: string;
  title: string;
  subtitle: string;
  prayerText: string;
  caption: string;
  cta: string;
};

export type ImageReferenceInput = {
  blob: Blob;
  filename: string;
};

function getImageConfig() {
  const apiKey = process.env.IMAGE_API_KEY || process.env.AI_API_KEY;
  const baseUrl = (process.env.IMAGE_BASE_URL || process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.IMAGE_MODEL || "gpt-image-1";
  const size = process.env.IMAGE_SIZE || "1024x1024";
  const quality = process.env.IMAGE_QUALITY || "high";
  const inputFidelity = process.env.IMAGE_INPUT_FIDELITY || "high";

  if (!apiKey) {
    throw new Error("Falta IMAGE_API_KEY (o AI_API_KEY) en .env.local");
  }

  return { apiKey, baseUrl, model, size, quality, inputFidelity };
}

export function buildImagePrompt({
  pageName,
  post,
  text,
  style,
}: {
  pageName: string;
  post: ImagePostContext;
  text: ImageTextContext;
  style: ImageStyleContext;
}) {
  return [
    `Crea una NUEVA imagen cuadrada para Facebook de la marca ${pageName} usando las imágenes adjuntas EXCLUSIVAMENTE como referencias visuales de estilo y composición.`,
    "No copies el texto existente de las referencias ni reutilices su oración. El contenido textual válido es únicamente el indicado en este prompt.",
    `Tema: ${post.topic || "devocional"}.`,
    `Figura religiosa principal: ${post.figureName}.`,
    `Intención: ${post.intention}.`,
    `Estilo guardado: ${style.name} (${style.category}).`,
    `Descripción: ${style.description}.`,
    `Mood: ${style.mood || "devocional"}.`,
    `Colores y luz: ${style.colorNotes || "elegantes y armoniosos"}.`,
    `Composición: ${style.layoutNotes || "figura protagonista y área clara para texto"}.`,
    `Reglas: ${style.usageRules || "mantener elegancia, legibilidad y atmósfera religiosa"}.`,
    `Motivo de selección: ${post.selectedStyleReason}.`,
    "Mantén la identidad estética de las referencias: ornamentos, equilibrio, nivel de detalle, iluminación, tratamiento editorial y sensación premium.",
    "Puedes cambiar por completo el santo, figura, escenario y elementos simbólicos necesarios para que coincidan con esta nueva publicación.",
    `Texto superior breve: ${text.eyebrow}`,
    `Título principal EXACTO: ${text.title}`,
    `Subtítulo EXACTO: ${text.subtitle}`,
    `Oración EXACTA, completa y en español: ${text.prayerText}`,
    `Marca inferior EXACTA: ${pageName}`,
    "Prioriza ortografía impecable, texto completo, jerarquía tipográfica clara y lectura cómoda incluso en pantalla móvil.",
    "No agregues hashtags, CTA ni caption dentro de la imagen.",
    "No agregues interfaz, mockups, dispositivos ni texto adicional inventado.",
  ].join("\n");
}

export async function generateImageWithReferences(prompt: string, references: ImageReferenceInput[]) {
  const { apiKey, baseUrl, model, size, quality, inputFidelity } = getImageConfig();

  if (references.length === 0) {
    throw new Error("El estilo seleccionado no tiene imágenes de referencia disponibles.");
  }

  const formData = new FormData();
  formData.append("model", model);
  formData.append("prompt", prompt);
  formData.append("size", size);
  formData.append("quality", quality);
  formData.append("input_fidelity", inputFidelity);
  formData.append("output_format", "png");
  formData.append("n", "1");

  for (const reference of references.slice(0, 4)) {
    formData.append("image[]", reference.blob, reference.filename);
  }

  const response = await fetch(`${baseUrl}/images/edits`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
    cache: "no-store",
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Error del generador de imagen (${response.status}): ${raw}`);
  }

  const payload = JSON.parse(raw) as {
    data?: Array<{
      b64_json?: string;
      revised_prompt?: string;
      url?: string;
    }>;
    output_format?: string;
    size?: string;
  };

  const item = payload.data?.[0];
  if (!item?.b64_json) {
    throw new Error("El generador de imagen no devolvió una imagen base64.");
  }

  return {
    bytes: Buffer.from(item.b64_json, "base64"),
    mimeType: "image/png",
    revisedPrompt: item.revised_prompt || "",
    extension: "png",
  };
}

export function createImageStoragePath({
  userId,
  postId,
  extension,
}: {
  userId: string;
  postId: string;
  extension: string;
}) {
  return `${userId}/${postId}/${crypto.randomUUID()}.${extension}`;
}
