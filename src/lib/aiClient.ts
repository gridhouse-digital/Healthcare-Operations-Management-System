import { supabase } from './supabase';
import { AIPrompts } from './ai/prompts';
import type {
    ApplicantSummary,
    ApplicantRanking,
    OfferLetter,
    OnboardingSummary,
    SetupHelper
} from './ai/schemas';

async function callAI<T>(
    functionName: string,
    systemPrompt: string,
    userInput: any
): Promise<T> {
    const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: typeof userInput === 'string' ? userInput : JSON.stringify(userInput) }
    ];

    const { data, error } = await supabase.functions.invoke(functionName, {
        body: { messages } // Pass messages to override backend default
    });

    if (error) throw error;

    // The Worker returns { result: { response: "JSON string" } }
    // or sometimes just the output if cached?
    // Let's handle both.

    // NOTE: never log the AI payload itself — it can contain applicant PII and
    // AI assessments. Log only non-PII shape info for debugging.
    console.debug("AI response received", {
        keys: data ? Object.keys(data) : [],
        from_cache: data?.from_cache ?? false,
    });

    // Worker returns: { success: true, task, model, result: { response: "..." } }
    // Or from cache: { success: true, output: "...", from_cache: true }

    // Try different paths based on response structure
    let responseText = null;

    // Path 1: Cached response (from Supabase Edge Function)
    if (data.output) {
        responseText = data.output;
    }
    // Path 2: Fresh AI response from Worker
    else if (data.result) {
        // For chat/reasoning tasks, Worker returns { result: { response: "..." } }
        responseText = data.result.response || data.result;
    }
    // Path 3: Direct response field
    else if (data.response) {
        responseText = data.response;
    }
    // Path 4: Error returned in data (e.g. from try-catch in Edge Function)
    else if (data.error) {
        console.error("AI returned specific error:", data.error);
        throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
    }

    if (!responseText) {
        console.error("AI response missing expected output field");
        throw new Error("AI did not return a response.");
    }

    // Check if responseText is already an object (not a string)
    if (typeof responseText === 'object') {
        return responseText as T;
    }

    try {
        // The AI might wrap JSON in markdown code blocks ```json ... ```
        const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
        const parsed = JSON.parse(cleanJson);
        return parsed as T;
    } catch (e) {
        // Do not log the raw response — it may contain applicant PII.
        console.error("AI returned invalid JSON (unparseable response)");
        throw new Error("AI returned invalid JSON.");
    }
}

// Top-level applicant keys that encode protected characteristics. Stripped
// before sending to the AI so the model is never given them to reason about
// (EEO input minimization — layered with the prompt-level EEO guardrail).
// Note: JotForm `answers` blobs may still embed such data in free-form fields;
// the prompt guardrail is the backstop for those.
const PROTECTED_APPLICANT_KEYS = [
    'date_of_birth', 'dob', 'birth_date', 'birthdate', 'age',
    'gender', 'sex', 'race', 'ethnicity', 'nationality', 'national_origin',
    'religion', 'marital_status', 'disability',
];

function stripProtectedAttributes<T extends Record<string, any>>(applicant: T): T {
    if (!applicant || typeof applicant !== 'object') return applicant;
    const clone: Record<string, any> = { ...applicant };
    for (const key of Object.keys(clone)) {
        if (PROTECTED_APPLICANT_KEYS.includes(key.toLowerCase())) {
            delete clone[key];
        }
    }
    return clone as T;
}

export const aiClient = {
    summarizeApplicant: async (applicant: any) => {
        return callAI<ApplicantSummary>(
            'ai-summarize-applicant',
            AIPrompts.summarizeApplicant(),
            stripProtectedAttributes(applicant)
        );
    },
    rankApplicants: async (candidates: any[], job_description: string) => {
        return callAI<ApplicantRanking>(
            'ai-rank-applicants',
            AIPrompts.rankApplicants(job_description),
            Array.isArray(candidates) ? candidates.map(stripProtectedAttributes) : candidates
        );
    },
    draftOfferLetter: async (details: any) => {
        return callAI<OfferLetter>(
            'ai-draft-offer-letter',
            AIPrompts.draftOfferLetter(details?.offerContext),
            details
        );
    },
    onboardingLogic: async (employee: any, status: string) => {
        // Inject the prompt/schema into the employee object so the AI sees it
        // The Edge Function strips unknown top-level keys, but 'employee' is a record(any)
        const prompt = AIPrompts.onboardingSummary();
        const enrichedEmployee = {
            ...employee,
            _ai_instructions: prompt
        };

        // Direct invoke to match Edge Function schema (expecting { employee, status })
        const { data, error } = await supabase.functions.invoke('ai-onboarding-logic', {
            body: { employee: enrichedEmployee, status }
        });

        if (error) throw error;

        // Handle error returned in data
        if (data && data.error) {
            throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
        }

        // Extract output similar to callAI logic
        let responseText = null;
        if (data.output) responseText = data.output;
        else if (data.result && data.result.response) responseText = data.result.response;
        else if (data.result) responseText = data.result;
        else if (data.response) responseText = data.response;

        if (!responseText) {
            console.error("AI response missing expected output field (onboarding logic)");
            throw new Error("AI did not return a response.");
        }

        // Parse JSON if needed
        if (typeof responseText === 'object') return responseText as OnboardingSummary;

        try {
            const cleanJson = responseText.replace(/```json\n?|\n?```/g, "").trim();
            const parsed = JSON.parse(cleanJson);
            return parsed as OnboardingSummary;
        } catch (e) {
            // Do not log the raw response — it may contain employee PII.
            console.error("AI returned invalid JSON (onboarding logic)");
            throw new Error("AI returned invalid JSON.");
        }
    },
    wpValidation: async (group: string, user: any) => {
        // Fallback to raw call if no schema/prompt defined
        const { data, error } = await supabase.functions.invoke('ai-wp-validation', {
            body: { group, user }
        });
        if (error) throw error;
        return data;
    },
    setupHelper: async (query: string) => {
        return callAI<SetupHelper>(
            'ai-summarize-applicant',
            AIPrompts.setupHelper(),
            query
        );
    }
};
