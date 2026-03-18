/**
 * LLM呼び出しヘルパー
 * Google Gemini APIを使用（Manus Forge APIからの移行）
 * 
 * 既存のinvokeLLM()インターフェースを維持しながら、
 * バックエンドをGemini APIに切り替えています。
 */
import { GoogleGenAI } from "@google/genai";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

/**
 * メッセージ内容を文字列に変換するヘルパー
 */
function contentToString(content: MessageContent | MessageContent[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === "string") return part;
        if (part.type === "text") return part.text;
        return "";
      })
      .join("\n");
  }
  if (content.type === "text") return content.text;
  return "";
}

/**
 * Google Gemini APIを使ってLLMを呼び出す
 * 既存のinvokeLLM()インターフェースと互換性を保つ
 */
export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const apiKey = ENV.geminiApiKey;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const ai = new GoogleGenAI({ apiKey });

  const {
    messages,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  // システムプロンプトを抽出
  const systemMessages = messages.filter(m => m.role === "system");
  const userMessages = messages.filter(m => m.role !== "system");

  const systemInstruction = systemMessages.length > 0
    ? systemMessages.map(m => contentToString(m.content)).join("\n")
    : undefined;

  // ユーザー・アシスタントメッセージをGemini形式に変換
  const contents = userMessages.map(m => ({
    role: m.role === "assistant" ? "model" as const : "user" as const,
    parts: [{ text: contentToString(m.content) }],
  }));

  // レスポンスフォーマットの決定
  const schema = outputSchema || output_schema;
  const format = responseFormat || response_format;
  let responseMimeType: string | undefined;
  let responseSchemaConfig: Record<string, unknown> | undefined;

  if (format?.type === "json_schema" && format.json_schema) {
    responseMimeType = "application/json";
    responseSchemaConfig = format.json_schema.schema;
  } else if (format?.type === "json_object") {
    responseMimeType = "application/json";
  } else if (schema) {
    responseMimeType = "application/json";
    responseSchemaConfig = schema.schema;
  }

  const config: Record<string, unknown> = {
    temperature: 0.7,
  };

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  if (responseMimeType) {
    config.responseMimeType = responseMimeType;
  }

  if (responseSchemaConfig) {
    config.responseSchema = responseSchemaConfig;
  }

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config,
  });

  const responseText = result.text ?? "";

  // 既存のInvokeResult形式に変換して返す
  return {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: "gemini-2.5-flash",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: responseText,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
