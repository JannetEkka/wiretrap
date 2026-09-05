/**
 * JSON Schema normalizer and sanitizer for Gemini function-calling declarations.
 *
 * Requirements:
 * 1. If parameters object already has "type": "object" with a "properties" key,
 *    pass it through with light validation.
 * 2. Otherwise treat it as shorthand and convert:
 *    - Each key becomes a property
 *    - Each string value maps to a JSON Schema type (string, number, integer, boolean, array, object)
 *    - Unknown or empty values default to string
 *    - Array values become {"type": "array", "items": {"type": "string"}}
 *    - Mark all keys as required
 * 3. Strip any field Gemini's schema doesn't accept — it only supports a subset of JSON Schema.
 *    Drop unsupported keywords ($schema, additionalProperties, default, minimum, maximum, etc.)
 * 4. If a tool's parameters can't be normalized at all, return null so caller can handle/skip gracefully.
 */

// Gemini supported Schema fields per @google/genai Schema specification
const ALLOWED_SCHEMA_FIELDS = new Set([
  'type',
  'format',
  'description',
  'nullable',
  'enum',
  'properties',
  'required',
  'items',
]);

const VALID_TYPES = new Set([
  'string',
  'number',
  'integer',
  'boolean',
  'array',
  'object',
]);

/**
 * Recursively sanitizes a Gemini JSON Schema object by stripping unsupported fields.
 */
export function sanitizeGeminiSchema(schema: any): any {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'string' };
  }

  const cleaned: Record<string, any> = {};

  // Normalize type
  let rawType = schema.type;
  if (typeof rawType === 'string') {
    rawType = rawType.toLowerCase();
    if (VALID_TYPES.has(rawType)) {
      cleaned.type = rawType;
    } else {
      cleaned.type = 'string';
    }
  } else {
    // If type is not specified but properties exists
    if (schema.properties && typeof schema.properties === 'object') {
      cleaned.type = 'object';
    } else {
      cleaned.type = 'string';
    }
  }

  // description
  if (typeof schema.description === 'string' && schema.description.trim()) {
    cleaned.description = schema.description.trim();
  }

  // format
  if (typeof schema.format === 'string' && schema.format.trim()) {
    cleaned.format = schema.format.trim();
  }

  // nullable
  if (typeof schema.nullable === 'boolean') {
    cleaned.nullable = schema.nullable;
  }

  // enum
  if (Array.isArray(schema.enum)) {
    const validEnums = schema.enum.filter((v: any) => typeof v === 'string');
    if (validEnums.length > 0) {
      cleaned.enum = validEnums;
    }
  }

  // properties for object
  if (cleaned.type === 'object') {
    cleaned.properties = {};
    if (
      schema.properties &&
      typeof schema.properties === 'object' &&
      !Array.isArray(schema.properties)
    ) {
      for (const [propKey, propVal] of Object.entries(schema.properties)) {
        const cleanKey = propKey.trim();
        if (cleanKey) {
          cleaned.properties[cleanKey] = sanitizeGeminiSchema(propVal);
        }
      }
    }

    // required
    if (Array.isArray(schema.required)) {
      const validReq = schema.required.filter(
        (r: any) =>
          typeof r === 'string' &&
          Object.prototype.hasOwnProperty.call(cleaned.properties, r)
      );
      if (validReq.length > 0) {
        cleaned.required = validReq;
      }
    }
  }

  // items for array
  if (cleaned.type === 'array') {
    if (schema.items && typeof schema.items === 'object') {
      cleaned.items = sanitizeGeminiSchema(schema.items);
    } else {
      cleaned.items = { type: 'string' };
    }
  }

  return cleaned;
}

/**
 * Normalizes tool parameters into a compliant Gemini FunctionDeclaration Schema object.
 * Supports:
 * - Full JSON Schema (type: object, properties: {...})
 * - Shorthand key-value mappings (e.g. {"command": "string", "count": "number"})
 * - Clean string representation or pre-parsed object
 */
export function normalizeToolParameters(raw: any): {
  type: string;
  properties: Record<string, any>;
  required?: string[];
  description?: string;
} | null {
  if (raw === null || raw === undefined) {
    return { type: 'object', properties: {} };
  }

  let parsed: any = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '{}') {
      return { type: 'object', properties: {} };
    }
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  // Check 1: If the parameters object already has "type": "object" with a "properties" key
  const hasTypeObject =
    typeof parsed.type === 'string' && parsed.type.toLowerCase() === 'object';
  const hasProperties =
    typeof parsed.properties === 'object' &&
    parsed.properties !== null &&
    !Array.isArray(parsed.properties);

  if (hasTypeObject && hasProperties) {
    // Pass it through with light validation & sanitization
    const sanitized = sanitizeGeminiSchema(parsed);
    if (!sanitized.properties) {
      sanitized.properties = {};
    }
    return sanitized as any;
  }

  // Check 2: Otherwise treat as shorthand and convert:
  // Each key becomes a property, each string value maps to a JSON Schema type
  // (string, number, integer, boolean, array, object). Unknown or empty values default to string.
  // Array values become {"type": "array", "items": {"type": "string"}}.
  // Mark all keys as required.
  const properties: Record<string, any> = {};
  const required: string[] = [];

  for (const [key, val] of Object.entries(parsed)) {
    const propKey = key.trim();
    if (!propKey) continue;

    required.push(propKey);

    if (typeof val === 'string') {
      const lower = val.trim().toLowerCase();
      if (lower === 'string') {
        properties[propKey] = { type: 'string' };
      } else if (lower === 'number') {
        properties[propKey] = { type: 'number' };
      } else if (lower === 'integer' || lower === 'int') {
        properties[propKey] = { type: 'integer' };
      } else if (lower === 'boolean' || lower === 'bool') {
        properties[propKey] = { type: 'boolean' };
      } else if (lower === 'array') {
        properties[propKey] = { type: 'array', items: { type: 'string' } };
      } else if (lower === 'object') {
        properties[propKey] = { type: 'object', properties: {} };
      } else {
        // Unknown or empty values default to string
        properties[propKey] = { type: 'string' };
      }
    } else if (Array.isArray(val)) {
      // Array values become {"type": "array", "items": {"type": "string"}}
      properties[propKey] = { type: 'array', items: { type: 'string' } };
    } else if (typeof val === 'object' && val !== null) {
      properties[propKey] = sanitizeGeminiSchema(val);
    } else {
      // Numbers, booleans, or other values
      properties[propKey] = { type: 'string' };
    }
  }

  const result: any = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    result.required = required;
  }

  return result;
}
