import {
    Body,
    Button,
    Container,
    Head,
    Heading,
    Html,
    Preview,
    Section,
    Text,
    Img,
    Tailwind,
    Hr,
} from "npm:@react-email/components@0.0.22";
import * as React from "npm:react@18.3.1";

interface OfferEmailProps {
    applicantName: string;
    applicantAddress?: string;
    applicantCityStateZip?: string;
    position: string;
    startDate: string;
    dailyRate?: string;
    patientName?: string;
    daysOfWeek?: string;
    dailyShiftHours?: string;
    totalHoursPerDay?: string;
    hourlyEquivalent?: string;
    employmentClassification?: string;
    offerUrl: string;
    logoUrl?: string;
    companyName?: string;
    signatoryName?: string;
    signatoryTitle?: string;
}

export const OfferEmail = ({
    applicantName = "Applicant Name",
    applicantAddress = "123 Applicant St",
    applicantCityStateZip = "City, State 12345",
    position = "Nurse",
    startDate = "January 1, 2025",
    dailyRate = "300.00",
    patientName = "Patient Name/Case",
    daysOfWeek = "Monday - Friday",
    dailyShiftHours = "8:00 AM – 8:00 PM",
    totalHoursPerDay = "12",
    hourlyEquivalent = "25.00",
    employmentClassification = "1099 contractor",
    offerUrl = "https://example.com/offer/123",
    logoUrl,
    companyName = "Your Organization",
    signatoryName = "Hiring Team",
    signatoryTitle = "Hiring Representative",
}: OfferEmailProps) => {
    return (
        <Html>
            <Head />
            <Preview>Your Offer from {companyName}</Preview>
            <Tailwind>
                <Body className="bg-white my-auto mx-auto font-sans">
                    <Container className="border border-solid border-[#eaeaea] rounded my-[40px] mx-auto p-[20px] max-w-[600px]">
                        {logoUrl && (
                            <Section className="mt-[20px] mb-[20px]">
                                <Img
                                    src={logoUrl}
                                    width="150"
                                    height="50"
                                    alt={companyName}
                                    className="mx-auto object-contain"
                                />
                            </Section>
                        )}
                        <Section className="mt-[20px]">
                            <Text className="text-black text-[14px] leading-[24px]">
                                {applicantName}
                                <br />
                                {applicantAddress}
                                <br />
                                {applicantCityStateZip}
                            </Text>
                            <Text className="text-black text-[14px] leading-[24px] mt-[20px]">
                                Dear {applicantName},
                            </Text>
                            <Text className="text-black text-[14px] leading-[24px]">
                                We are pleased to offer you the position of <strong>{position}</strong> with {companyName}, contingent upon completion of all required onboarding documentation and clearances.
                            </Text>

                            <Heading as="h3" className="text-black text-[16px] font-bold mt-[20px] mb-[10px]">
                                Position & Work Schedule
                            </Heading>
                            <Text className="text-black text-[14px] leading-[24px]">
                                You will be assigned to provide patient care for <strong>{patientName}</strong>. Your typical schedule will be:
                            </Text>
                            <ul className="list-disc pl-5 m-0 text-black text-[14px] leading-[24px]">
                                <li>{daysOfWeek}</li>
                                <li>{dailyShiftHours}</li>
                                <li>Total Hours Worked per Day: {totalHoursPerDay} hours</li>
                            </ul>

                            <Heading as="h3" className="text-black text-[16px] font-bold mt-[20px] mb-[10px]">
                                Compensation Structure
                            </Heading>
                            <Text className="text-black text-[14px] leading-[24px]">
                                This position is compensated at a daily rate, not hourly. Your daily rate is: <strong>${dailyRate} per day</strong>.
                            </Text>
                            <Text className="text-black text-[14px] leading-[24px]">
                                Although the position is paid daily, we can provide an estimated hourly breakdown for clarification only. Based on your daily schedule of {totalHoursPerDay} hours, your approximate hourly equivalent is:
                            </Text>
                            <ul className="list-disc pl-5 m-0 text-black text-[14px] leading-[24px]">
                                <li>Hourly Equivalent: ${hourlyEquivalent} per hour</li>
                            </ul>
                            <Text className="text-black text-[14px] leading-[24px]">
                                (This hourly calculation is for informational purposes only and does not change the daily rate pay structure.)
                                <br />
                                You will receive pay only for days worked and approved by the company.
                            </Text>

                            <Heading as="h3" className="text-black text-[16px] font-bold mt-[20px] mb-[10px]">
                                Overtime & Holiday Pay
                            </Heading>
                            <Text className="text-black text-[14px] leading-[24px]">
                                Because this is a daily-rate position, no overtime pay is provided for hours worked beyond the daily schedule.
                                <br />
                                However, holiday pay is provided for the following four company-recognized holidays when worked:
                            </Text>
                            <ol className="list-decimal pl-5 m-0 text-black text-[14px] leading-[24px]">
                                <li>New Year’s Day</li>
                                <li>Independence Day (July 4th)</li>
                                <li>Thanksgiving Day</li>
                                <li>Christmas Day</li>
                            </ol>
                            <Text className="text-black text-[14px] leading-[24px]">
                                Holiday pay rates will be communicated as needed and apply only when you are scheduled and approved to work on these holidays.
                            </Text>

                            <Heading as="h3" className="text-black text-[16px] font-bold mt-[20px] mb-[10px]">
                                Employment Classification
                            </Heading>
                            <Text className="text-black text-[14px] leading-[24px]">
                                Your employment with {companyName} is considered <strong>{employmentClassification}</strong>. Nothing in this offer letter should be construed as a contract guaranteeing employment for any specific duration.
                            </Text>

                            <Heading as="h3" className="text-black text-[16px] font-bold mt-[20px] mb-[10px]">
                                Start Date
                            </Heading>
                            <Text className="text-black text-[14px] leading-[24px]">
                                Your anticipated start date is <strong>{startDate}</strong>, pending all onboarding requirements.
                            </Text>

                            <Heading as="h3" className="text-black text-[16px] font-bold mt-[20px] mb-[10px]">
                                Acknowledgment & Acceptance
                            </Heading>
                            <Text className="text-black text-[14px] leading-[24px]">
                                Please sign and return this offer letter to confirm your acceptance. We look forward to having you as part of our team and believe your skills will be an asset to our company and the patients we serve.
                            </Text>

                            <Text className="text-black text-[14px] leading-[24px] mt-[20px]">
                                Warm regards,
                                <br />
                                <strong>{signatoryName}</strong>
                                <br />
                                {signatoryTitle}
                                <br />
                                {companyName}
                            </Text>

                            <Hr className="border-gray-300 my-[30px]" />

                            <Heading as="h3" className="text-black text-[16px] font-bold mb-[10px]">
                                Employee Acceptance
                            </Heading>
                            <Text className="text-black text-[14px] leading-[24px]">
                                I, <strong>{applicantName}</strong>, acknowledge and accept the terms of employment outlined in this offer letter.
                            </Text>

                            <Section className="text-center mt-[32px] mb-[32px]">
                                <Button
                                    className="bg-[#3B82F6] rounded text-white text-[14px] font-semibold no-underline text-center px-6 py-3"
                                    href={offerUrl}
                                >
                                    Sign & Accept Offer
                                </Button>
                            </Section>
                        </Section>
                    </Container>
                </Body>
            </Tailwind>
        </Html>
    );
};

export default OfferEmail;
