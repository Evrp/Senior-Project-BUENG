import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODELS, TASK_MODELS } from '../constants/gemini.js';

let genAIInstance = null;
let modelRotationIndex = 0;

/**
 * Get the initialized Gemini AI instance.
 */
export const getGenAI = () => {
  if (!genAIInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables.');
    }
    genAIInstance = new GoogleGenerativeAI(apiKey);
  }
  return genAIInstance;
};

/**
 * Get the best model for a specific task or rotate models based on index.
 * @param {string} taskType - The specific activity (e.g., 'CHAT', 'MATCHING')
 * @returns {object} - The selected generative model instance.
 */
export const getModel = (taskType = null, config = {}) => {
  const genAI = getGenAI();
  let modelName;

  // 1. Priority: Task-specific model
  if (taskType && TASK_MODELS[taskType]) {
    modelName = TASK_MODELS[taskType];
    console.info(`[Gemini AutoModel] Task: ${taskType} | Using: ${modelName}`);
  } else {
    // 2. Fallback: Round-robin rotation to avoid rate limits on generic tasks
    modelName = GEMINI_MODELS[modelRotationIndex];
    console.info(`[Gemini AutoModel] Rotating | Using: ${modelName} (Index: ${modelRotationIndex})`);
    modelRotationIndex = (modelRotationIndex + 1) % GEMINI_MODELS.length;
  }

  // 3. Grounding: Enable Google Search for specific real-time tasks
  // Incompatible with structured JSON output (responseMimeType: 'application/json')
  const isJsonMode = config.generationConfig?.responseMimeType === 'application/json';

  if (taskType === 'CHAT' && !isJsonMode) {
    config.tools = config.tools || [];
    // Only add if not already present
    if (!config.tools.find((t) => t.googleSearch)) {
      config.tools.push({ googleSearch: {} });
    }
  }

  // Allow custom overrides if needed
  const finalModelName = config.model || modelName;
  
  const modelInstance = genAI.getGenerativeModel({
    model: finalModelName,
    ...config,
  });

  // Dynamic fallback wrapper: intercept generateContent calls to fallback to stable models on error
  const originalGenerateContent = modelInstance.generateContent.bind(modelInstance);
  modelInstance.generateContent = async function (params) {
    try {
      return await originalGenerateContent(params);
    } catch (error) {
      const isModelError = error.message && (
        error.message.includes('not found') || 
        error.message.includes('not support') || 
        error.message.includes('invalid') ||
        error.message.includes('404')
      );
      console.warn(`[Gemini Fallback Warning] Model '${finalModelName}' failed. Retrying with stable 'gemini-1.5-flash'. Error: ${error.message}`);
      try {
        const fallbackModel = genAI.getGenerativeModel({
          model: 'gemini-1.5-flash',
          ...config,
        });
        return await fallbackModel.generateContent(params);
      } catch (fallbackError) {
        console.error(`[Gemini Fallback Error] Stable fallback also failed:`, fallbackError.message);
        throw error; // Rethrow original error if fallback also fails
      }
    }
  };

  return modelInstance;
};

