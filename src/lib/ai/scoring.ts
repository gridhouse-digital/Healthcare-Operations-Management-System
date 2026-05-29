/**
 * Deterministic applicant scoring system
 * Calculates a score from 0-100 based on objective criteria
 */

export interface ScoreBreakdown {
    total: number;
    documentCompletion: number;
    experience: number;
    certifications: number;
    availability: number;
    backgroundCheck: number;
}

export function calculateApplicantScore(applicant: any): ScoreBreakdown {
    // Log only the applicant id + the set of answer keys (no values) so we
    // never write applicant PII (names, addresses, answers) to the console.
    console.debug('Calculating applicant score', {
        id: applicant?.id,
        answersKeys: applicant?.answers ? Object.keys(applicant.answers) : [],
    });

    let total = 0;

    // 1. Document Completion (30 points)
    // All required forms must be submitted
    const documentCompletion = calculateDocumentCompletion(applicant);
    total += documentCompletion;

    // 2. Experience (25 points)
    // Based on employment history and education
    const experience = calculateExperience(applicant);
    total += experience;

    // 3. Certifications & Licenses (25 points)
    // Based on licenses and certifications submitted
    const certifications = calculateCertifications(applicant);
    total += certifications;

    // 4. Availability (10 points)
    // Based on hours available and flexibility
    const availability = calculateAvailability(applicant);
    total += availability;

    // 5. Background Check (10 points)
    // Completed and clean background check
    const backgroundCheck = calculateBackgroundCheck(applicant);
    total += backgroundCheck;

    return {
        total: Math.min(100, Math.round(total)),
        documentCompletion: Math.round(documentCompletion),
        experience: Math.round(experience),
        certifications: Math.round(certifications),
        availability: Math.round(availability),
        backgroundCheck: Math.round(backgroundCheck)
    };
}

function calculateDocumentCompletion(applicant: any): number {
    const requiredForms = [
        'emergency_contact',
        'i9_eligibility',
        'vaccination',
        'licenses',
        'background_check'
    ];

    const completedForms = requiredForms.filter(form => applicant?.[form]?.id).length;
    const completionRate = completedForms / requiredForms.length;

    // Full 30 points if all forms completed
    return completionRate * 30;
}

function calculateExperience(applicant: any): number {
    let points = 0;

    // Access answers object
    const answers = applicant?.answers || {};

    // JotForm fields: input15 has job title, input18 has current employer, input70 has previous employer
    const currentEmployerData = answers?.input18 || {};
    const previousEmployerData = answers?.input70 || {};
    const availabilityData = answers?.input15 || {};

    // Extract employer and job title info
    const currentEmployer = currentEmployerData['shorttext-1'] || '';
    const currentJobTitle = availabilityData['shorttext-8'] || '';
    const previousEmployer = previousEmployerData['shorttext-1'] || '';
    const previousJobTitle = previousEmployerData['shorttext-5'] || '';

    // Combine all employment text
    const employerText = [currentEmployer, currentJobTitle, previousEmployer, previousJobTitle]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

    // Has healthcare/caregiving experience (15 points)
    if (employerText.length > 0) {
        const isHealthcareRelated =
            employerText.includes('care') ||
            employerText.includes('health') ||
            employerText.includes('medical') ||
            employerText.includes('nurse') ||
            employerText.includes('aide') ||
            employerText.includes('assistant') ||
            employerText.includes('cna') ||
            employerText.includes('caregiver') ||
            employerText.includes('home') ||
            employerText.includes('patient');

        if (isHealthcareRelated) {
            points += 15; // Healthcare experience
        } else {
            // Some work experience, but not healthcare-specific
            points += 8;
        }
    }

    // Education (10 points) - check educationalBackground field
    const education = answers?.educationalBackground || {};
    const educationText = JSON.stringify(education).toLowerCase();

    if (educationText.includes('college') || educationText.includes('university') || educationText.includes('graduate')) {
        points += 10;
    } else if (educationText.includes('high school') || educationText.includes('diploma')) {
        points += 5;
    }

    return Math.min(points, 25);
}

function calculateCertifications(applicant: any): number {
    let points = 0;

    // Licenses form submitted and verified (15 points)
    if (applicant?.licenses?.id) {
        points += 15;

        // Check for specific healthcare licenses in the data
        const licensesData = applicant?.licenses;
        if (licensesData) {
            // If they have driver's license (basic requirement) - already counted above
            // Additional certifications could add more points here
            // This is a placeholder for future enhancement
        }
    }

    // Vaccination records submitted (5 points)
    if (applicant?.vaccination?.id) {
        points += 5;
    }

    // I9 Eligibility completed (5 points - legal to work)
    if (applicant?.i9_eligibility?.id) {
        points += 5;
    }

    return Math.min(points, 25);
}

function calculateAvailability(applicant: any): number {
    let points = 0;

    const answers = applicant?.answers || {};

    // input15 contains availability: hours in 'shorttext-15', evenings/weekends in option fields
    const availabilityData = answers?.input15 || {};

    // Hours available per week
    const hoursAvailable = parseInt(availabilityData['shorttext-15']) || 0;

    if (hoursAvailable >= 40) {
        points += 5; // Full-time availability
    } else if (hoursAvailable >= 20) {
        points += 3; // Part-time availability
    } else if (hoursAvailable > 0) {
        points += 1; // Limited availability
    } else {
        // If no hours specified, give partial credit
        points += 2;
    }

    // Flexibility (evenings, weekends) - check option fields
    let flexibilityCount = 0;
    const options = availabilityData['option1-13'] || '';
    const options2 = availabilityData['option2-13'] || '';

    if (options.includes('Evening') || options2.includes('Evening')) flexibilityCount++;
    if (options.includes('Weekend') || options2.includes('Weekend')) flexibilityCount++;

    points += Math.min(flexibilityCount * 2.5, 5); // Up to 5 points for flexibility

    return Math.min(points, 10);
}

function calculateBackgroundCheck(applicant: any): number {
    // Background check form submitted (10 points)
    // In the future, this could check the actual status of the background check
    if (applicant?.background_check?.id) {
        return 10;
    }

    return 0;
}

/**
 * Get a color class based on score range
 */
export function getScoreColor(score: number): string {
    if (score >= 80) return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
    if (score >= 60) return 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30';
    return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
}

/**
 * Get a descriptive label for a score
 */
export function getScoreLabel(score: number): string {
    if (score >= 90) return 'Excellent Candidate';
    if (score >= 80) return 'Strong Candidate';
    if (score >= 70) return 'Good Candidate';
    if (score >= 60) return 'Potential Candidate';
    if (score >= 50) return 'Needs Review';
    return 'Incomplete Application';
}
