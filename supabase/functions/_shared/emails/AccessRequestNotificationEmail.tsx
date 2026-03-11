import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
} from "npm:@react-email/components@0.0.22";
import * as React from "npm:react@18.3.1";

interface AccessRequestNotificationEmailProps {
  organizationName: string;
  primaryContactName: string;
  workEmail: string;
  phone?: string | null;
  teamSize: string;
  integrationNeeds?: string | null;
  notes?: string | null;
  submittedAt: string;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <Section className="border-b border-solid border-[#e5e7eb] py-[10px]">
      <Text className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
        {label}
      </Text>
      <Text className="m-0 mt-[6px] text-[14px] leading-[22px] text-[#111827]">
        {value}
      </Text>
    </Section>
  );
}

export function AccessRequestNotificationEmail({
  organizationName = "Agency Name",
  primaryContactName = "Primary Contact",
  workEmail = "ops@example.com",
  phone = null,
  teamSize = "11-25",
  integrationNeeds = null,
  notes = null,
  submittedAt = new Date().toUTCString(),
}: AccessRequestNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>New HOMS access request from {organizationName}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-[#f4f4f5] font-sans">
          <Container className="mx-auto my-[32px] max-w-[560px] rounded-[16px] border border-solid border-[#e5e7eb] bg-white p-[24px]">
            <Heading className="m-0 text-[24px] font-semibold tracking-[-0.02em] text-[#111827]">
              New access request
            </Heading>
            <Text className="mb-0 mt-[10px] text-[14px] leading-[22px] text-[#4b5563]">
              A new organization has submitted the public request-access intake.
              Review the details below and continue the manual tenant onboarding
              runbook if approved.
            </Text>

            <Section className="mt-[20px] rounded-[12px] bg-[#f9fafb] px-[16px] py-[6px]">
              <DetailRow label="Organization" value={organizationName} />
              <DetailRow label="Primary contact" value={primaryContactName} />
              <DetailRow label="Work email" value={workEmail} />
              <DetailRow label="Phone" value={phone || "Not provided"} />
              <DetailRow label="Estimated team size" value={teamSize} />
              <DetailRow
                label="Integration needs"
                value={integrationNeeds || "Not provided"}
              />
              <DetailRow label="Notes" value={notes || "Not provided"} />
              <Text className="m-0 py-[10px] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6b7280]">
                Submitted
              </Text>
              <Text className="m-0 pb-[10px] text-[14px] leading-[22px] text-[#111827]">
                {submittedAt}
              </Text>
            </Section>

            <Text className="mb-0 mt-[20px] text-[13px] leading-[22px] text-[#4b5563]">
              Reply directly to {workEmail} to continue the conversation.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
