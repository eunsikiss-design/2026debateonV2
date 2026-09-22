/**
 * 통합사회 논술·토론 AI 코치 플랫폼 ('디베이트온')
 * prompts/basicWritingCoach.js
 * 
 * 기초 연습실 (2~3문장 짧은 논증) 전용 AI 코칭 프롬프트 및 JSON 스키마
 */

const { SHARED_COACH_RULES_TEXT } = require('./sharedCoachRules');

const BASIC_WRITING_COACH_SYSTEM_PROMPT = `
당신은 대한민국 고등학교 1학년 「통합사회」 논술·토론 수업의 전담 AI 코치 '소크라'입니다.
학생의 생각 만들기, 주장하기, 근거 제시하기, 개념 연결하기 능력을 신장시키는 것이 당신의 사명입니다.

${SHARED_COACH_RULES_TEXT}

[기초 연습실 코칭 지침]
- 학생은 2~3문장으로 [주장(Claim)], [이유 및 교과개념(Reasoning)], [반론 고려 및 마무리(Rebuttal/Impact)]을 작성합니다.
- 학생의 작성 내용을 분석하여 반드시 다음 JSON 형식으로만 응답해야 합니다.
- 어떤 경우에도 완성된 모범 답안이나 학생 대신 글을 써주는 텍스트를 응답에 포함하지 마십시오.
- 점수는 내부 진단용(0~3점 척도)으로만 산정하며, 피드백은 따뜻하고 격려하는 어조의 소크라테스식 한국어로 작성하십시오.
- 잘한 점은 1~2개로 간결히 칭찬하고, 개선점은 가장 시급한 1개만 지목하십시오.
- 다음 생각 촉진 질문(question)을 반드시 1개 던져서 학생이 다시 쓰기에 도전하도록 이끄십시오.
`.trim();

const BASIC_WRITING_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    analysis: {
      type: "OBJECT",
      properties: {
        claim: { type: "INTEGER", description: "주장의 명확성 (0~3)" },
        evidence: { type: "INTEGER", description: "근거/자료의 구체성 (0~3)" },
        reasoning: { type: "INTEGER", description: "주장과 근거의 연결성 (0~3)" },
        concept: { type: "INTEGER", description: "사회과 교과개념 활용도 (0~3)" },
        rebuttal: { type: "INTEGER", description: "반론 고려 및 결론 (0~3)" }
      },
      required: ["claim", "evidence", "reasoning", "concept", "rebuttal"]
    },
    diagnosis: {
      type: "OBJECT",
      properties: {
        strengths: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "학생이 잘한 점 1~2개"
        },
        weaknesses: {
          type: "ARRAY",
          items: { type: "STRING" },
          description: "가장 중요한 개선점 1개"
        }
      },
      required: ["strengths", "weaknesses"]
    },
    scaffold: {
      type: "OBJECT",
      properties: {
        currentLevel: { type: "INTEGER", description: "현재 적용된 비계 레벨 (0~5)" },
        recommendedLevel: { type: "INTEGER", description: "다음 추천 비계 레벨 (0~5)" },
        scaffoldGuidance: { type: "STRING", description: "비계 레벨에 따른 소크라식 질문 또는 틀 안내" }
      },
      required: ["currentLevel", "recommendedLevel", "scaffoldGuidance"]
    },
    feedback: {
      type: "OBJECT",
      properties: {
        praise: { type: "STRING", description: "따뜻하고 구체적인 칭찬 1~2문장" },
        nextChallenge: { type: "STRING", description: "지금 바로 학생이 고쳐볼 수 있는 단 하나의 도전 과제" },
        question: { type: "STRING", description: "사고를 촉진하는 소크라테스식 질문 1문장" }
      },
      required: ["praise", "nextChallenge", "question"]
    },
    badgeEligible: {
      type: "BOOLEAN",
      description: "기초 문장 작성 및 논증 요건을 충족하여 뱃지 획득 가능한 수준인지 여부"
    }
  },
  required: ["analysis", "diagnosis", "scaffold", "feedback", "badgeEligible"]
};

module.exports = {
  BASIC_WRITING_COACH_SYSTEM_PROMPT,
  BASIC_WRITING_JSON_SCHEMA
};

