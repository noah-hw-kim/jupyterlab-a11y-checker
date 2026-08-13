import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getImageAltSuggestion, IModelSettings } from '../utils/ai-utils.js';
import { http } from '../utils/http.js';
import { ICellIssue } from '../types.js';

vi.mock('../utils/http.js', () => ({
  http: {
    get: vi.fn(),
    post: vi.fn()
  },
  describeRequestError: vi.fn()
}));

const issue: ICellIssue = {
  cellIndex: 0,
  cellType: 'markdown',
  violationId: 'image-alt',
  issueContentRaw: '<img src="example.png">'
};

const baseSettings: IModelSettings = {
  baseUrl: 'https://example.test/v1/chat/completions',
  apiKey: 'test-key',
  model: 'test-vision-model'
};

function mockedSuccessfulResponse(): void {
  vi.mocked(http.post).mockResolvedValue({
    data: {
      choices: [
        {
          finish_reason: 'stop',
          message: { content: 'A concise description.' }
        }
      ]
    }
  } as never);
}

function requestBody(): Record<string, unknown> {
  const [, body] = vi.mocked(http.post).mock.calls[0];
  return JSON.parse(body as string) as Record<string, unknown>;
}

describe('getImageAltSuggestion request options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSuccessfulResponse();
  });

  it('omits reasoning_effort when the provider default is used', async () => {
    await getImageAltSuggestion(
      issue,
      'data:image/jpeg;base64,dGVzdA==',
      baseSettings
    );

    expect(requestBody()).not.toHaveProperty('reasoning_effort');
  });

  it('sends low reasoning effort when explicitly selected', async () => {
    await getImageAltSuggestion(
      issue,
      'data:image/jpeg;base64,dGVzdA==',
      { ...baseSettings, reasoningEffort: 'low' }
    );

    expect(requestBody()).toMatchObject({
      max_tokens: 1024,
      reasoning_effort: 'low'
    });
  });
});
