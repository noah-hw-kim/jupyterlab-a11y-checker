import { http, describeRequestError } from './http.js';
import { ICellIssue } from '../types.js';

const SUGGESTION_MAX_TOKENS = 1024;
const GENERAL_LLM_MAX_TOKENS = 1500;

export interface IModelSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort?: 'low';
}

export interface IAISuggestionResponse {
  ok: boolean;
  text: string;
}

async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  /**
   * Function that fetches image from url, converts to JPEG, and returns in base64 format.
   * Similar to the Python convert_to_jpeg_base64 function in your notebook.
   */

  const response = await http.get(imageUrl, { responseType: 'blob' });
  const imageBlob = response.data as Blob;

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Create canvas and draw image
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }

      // Set canvas size to image size
      canvas.width = img.width;
      canvas.height = img.height;

      // If image has transparency, fill with white background first
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw the image on canvas
      ctx.drawImage(img, 0, 0);

      // Convert to JPEG base64 (quality 95% like in the Python example)
      const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.95);

      // Extract just the base64 part (remove "data:image/jpeg;base64,")
      const base64String = jpegDataUrl.split(',')[1];
      resolve(base64String);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };

    // Create object URL from blob and load it
    const objectUrl = URL.createObjectURL(imageBlob);
    img.src = objectUrl;
  });
}

export async function getImageAltSuggestion(
  issue: ICellIssue,
  imageData: string,
  visionSettings: IModelSettings
): Promise<IAISuggestionResponse> {
  let prompt =
    'Return only one plain-text sentence of no more than 40 words describing the essential visual content. Do not include analysis, explanations, labels, quotation marks, or the word "image".';
  prompt += `Content: \n${issue.issueContentRaw}\n\n`;

  // New River implementation - using OpenAI Chat Completions API format
  try {
    const imageUrl = imageData.startsWith('data:image')
      ? imageData
      : `data:image/jpeg;base64,${await fetchImageAsBase64(imageData)}`;

    const body = JSON.stringify({
      model: visionSettings.model,
      messages: [
        {
          role: 'system',
          content:
            'You generate concise alt text. Answer directly without analysis or explanation.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageUrl
              }
            }
          ]
        }
      ],
      max_tokens: SUGGESTION_MAX_TOKENS,
      ...(visionSettings.reasoningEffort === 'low'
        ? { reasoning_effort: 'low' }
        : {})
    });

    const response = await http.post(visionSettings.baseUrl, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${visionSettings.apiKey}`
      }
    });

    // Parse response using OpenAI Chat Completions format
    if (
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message
    ) {
      const choice = response.data.choices[0];
      // New check for token truncation
      if (choice.finish_reason === 'length') {
        return {
          ok: false,
          text: `This model reached the ${SUGGESTION_MAX_TOKENS.toLocaleString('en-US')}-token limit before producing alt text. Try selecting Low reasoning effort in Settings -> Settings Editor -> A11y Checker Settings, or use a more compact vision model.`
        };
      }

      const responseText = response.data.choices[0].message.content;
      return responseText
        ? { ok: true, text: responseText.trim() }
        : { ok: false, text: 'No content in response' };
    } else {
      console.error('Unexpected response structure:', response.data);
      return { ok: false, text: 'Error parsing response' };
    }
  } catch (error) {
    console.error('Error getting suggestions:', error);
    return {
      ok: false,
      text: `Alt text request failed — ${describeRequestError(error)}`
    };
  }
}

export async function getTableCaptionSuggestion(
  issue: ICellIssue,
  languageSettings: IModelSettings
): Promise<IAISuggestionResponse> {
  const prompt = `Given this HTML table, please provide a caption for the table to be served as a title or heading for the table. Avoid using the word "table" in the caption. Here's the table:
    ${issue.issueContentRaw}`;

  // New River implementation - using OpenAI Chat Completions API format
  try {
    const body = JSON.stringify({
      model: languageSettings.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a helpful assistant that generates captions for HTML tables.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: SUGGESTION_MAX_TOKENS
    });

    const response = await http.post(languageSettings.baseUrl, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${languageSettings.apiKey}`
      }
    });

    // Parse response using OpenAI Chat Completions format
    if (
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message
    ) {
      const choice = response.data.choices[0];

      if (choice.finish_reason === 'length') {
        return {
          ok: false,
          text: `This model reached the ${SUGGESTION_MAX_TOKENS.toLocaleString('en-US')}-token limit before producing a caption. Try a more compact language model.`
        };
      }

      const responseText = response.data.choices[0].message.content;
      return responseText
        ? { ok: true, text: responseText.trim() }
        : { ok: false, text: 'No content in response' };
    } else {
      console.error('Unexpected response structure:', response.data);
      return { ok: false, text: 'Error parsing response' };
    }
  } catch (error) {
    console.error('Error getting suggestions:', error);
    return {
      ok: false,
      text: `Caption request failed — ${describeRequestError(error)}`
    };
  }
}

export async function sendLLMRequest(
  prompt: string,
  settings: IModelSettings,
  systemMessage: string = 'You are a helpful assistant.'
): Promise<IAISuggestionResponse> {
  try {
    const body = JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: 'system',
          content: systemMessage
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: GENERAL_LLM_MAX_TOKENS
    });

    const response = await http.post(settings.baseUrl, body, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      }
    });

    if (
      response.data.choices &&
      response.data.choices[0] &&
      response.data.choices[0].message
    ) {
      const choice = response.data.choices[0];
      if (choice.finish_reason === 'length') {
        return {
          ok: false,
          text: `This model reached the ${GENERAL_LLM_MAX_TOKENS.toLocaleString('en-US')}-token limit before completing the response. Try a shorter prompt or a model that produces more concise responses.`
        };
      }

      const responseText = response.data.choices[0].message.content;
      return responseText
        ? { ok: true, text: responseText.trim() }
        : { ok: false, text: 'No content in response' };
    } else {
      console.error('Unexpected response structure:', response.data);
      return { ok: false, text: 'Error parsing response' };
    }
  } catch (error) {
    console.error('Error sending LLM request:', error);
    return {
      ok: false,
      text: `Request failed — ${describeRequestError(error)}`
    };
  }
}
