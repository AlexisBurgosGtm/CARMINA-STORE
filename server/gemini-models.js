/** Modelos Gemini disponibles para cotización (iterables desde Configuraciones) */
const GEMINI_MODELS = [
  { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash (recomendado)' },
  { id: 'gemini-flash-latest', label: 'Gemini Flash Latest' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (legacy)' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
];

const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
const SETTING_MODELO = 'MODELO GEMINI';

function isAllowedGeminiModel(id) {
  return GEMINI_MODELS.some((m) => m.id === id);
}

module.exports = {
  GEMINI_MODELS,
  DEFAULT_GEMINI_MODEL,
  SETTING_MODELO,
  isAllowedGeminiModel,
};
