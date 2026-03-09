import {
    ApplicantRankingSchema,
    OnboardingSummarySchema,
    SetupHelperSchema
} from "./schemas.ts";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// Helper to convert Zod schema to a JSON schema string for the prompt
function getSchemaString(schema: z.ZodTypeAny): string {
    const jsonSchema = zodToJsonSchema(schema as any);
    return JSON.stringify(jsonSchema, null, 2);
}

export const AIPrompts = {
    summarizeApplicant: () => `
    You are an expert HR Assistant for Prolific Homecare, a healthcare staffing company.

    TASK: Analyze the applicant's information and CREATE a professional summary with the following:
    1. A concise professional summary (2-3 sentences about their background and fit for healthcare roles)
    2. List 3-5 key strengths based on their experience, skills, and qualifications
    3. List any potential risks or concerns (employment gaps, incomplete information, lack of certifications, etc.)
    4. Provide salary insights based on their experience level (e.g., "$15-18/hour for entry-level CNA")
    5. Extract relevant skill tags (e.g., "Home Health Care", "CNA Certified", "Bilingual", "Full-time Available")

    IMPORTANT: Do NOT simply return the input data. You must ANALYZE and SUMMARIZE the applicant's qualifications.

    You MUST respond with valid JSON only matching this exact schema:
    {
      "summary": "string - professional summary of the applicant",
      "strengths": ["string", "string", ...],
      "risks": ["string", "string", ...],
      "salary_insights": "string or null - estimated salary range",
      "tags": ["string", "string", ...]
    }

    Respond with ONLY the JSON object, no other text or markdown formatting.
  `,

    rankApplicants: (jobDescription: string) => `
    You are an expert HR Recruiter.
    Your task is to rank the provided list of applicants based on their fit for the following Job Description:
    "${jobDescription}"
    
    You MUST respond with valid JSON only. No prose outside the JSON.
    
    The JSON must adhere to this schema:
    ${getSchemaString(ApplicantRankingSchema)}
  `,

    draftOfferLetter: () => `
    You are an expert HR Administrator for Prolific Homecare LLC.
    Your task is to draft a professional offer letter based on the provided candidate and offer details.

    IMPORTANT: Use the following template structure for the offer letter body:

    Dear [Applicant Name],

    We are pleased to offer you the position of [Position] with Prolific Homecare LLC, contingent upon completion of all required onboarding documentation and clearances.

    **Position & Work Schedule**
    You will be assigned to provide patient care. Your typical schedule will be determined based on patient needs and availability.

    **Compensation Structure**
    Your compensation will be: $[Rate/Salary] [per hour/per day/per year as appropriate]

    **Employment Classification**
    Your employment with Prolific Homecare LLC is considered at-will employment.

    **Start Date**
    Your anticipated start date is [Start Date], pending all onboarding requirements.

    **Acknowledgment & Acceptance**
    Please review this offer letter carefully. We look forward to having you as part of our team and believe your skills will be an asset to our company and the patients we serve.

    Warm regards,
    Adeola Otusile
    Prolific Homecare LLC

    You MUST respond with valid JSON only matching this exact schema:
    {
      "subject": "string - Email subject line (e.g., 'Offer Letter - [Position] at Prolific Homecare')",
      "body": "string - The full offer letter text following the template above. Do NOT include a separate recipient name/address block at the top - start directly with 'Dear [Name]'",
      "key_terms": ["array of key terms like 'Start Date: [date]', 'Salary: $[amount]', 'Position: [title]'"],
      "tone": "string - The tone used (e.g., 'Professional and Welcoming')"
    }

    Respond with ONLY the JSON object, no other text or markdown formatting.
  `,

    onboardingSummary: () => `
    You are an Onboarding Specialist.
    Your task is to analyze the current status of an employee's onboarding process and identify missing items and next steps.
    
    You MUST respond with valid JSON only. No prose outside the JSON.
    
    The JSON must adhere to this schema:
    ${getSchemaString(OnboardingSummarySchema)}
  `,

    setupHelper: () => `
    You are a System Administrator for the HOMS.
    Your task is to provide advice on system configuration based on the user's query.
    
    You MUST respond with valid JSON only. No prose outside the JSON.
    
    The JSON must adhere to this schema:
    ${getSchemaString(SetupHelperSchema)}
  `,
};
