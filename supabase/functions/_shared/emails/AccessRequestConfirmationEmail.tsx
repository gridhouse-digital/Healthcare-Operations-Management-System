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

interface AccessRequestConfirmationEmailProps {
  organizationName: string;
  primaryContactName: string;
}

export function AccessRequestConfirmationEmail({
  organizationName = "Agency Name",
  primaryContactName = "Primary Contact",
}: AccessRequestConfirmationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>We received your HOMS access request</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-[#f4f4f5] font-sans">
          <Container className="mx-auto my-[32px] max-w-[560px] rounded-[16px] border border-solid border-[#e5e7eb] bg-white p-[24px]">
            <Heading className="m-0 text-[24px] font-semibold tracking-[-0.02em] text-[#111827]">
              Request received
            </Heading>
            <Text className="mb-0 mt-[12px] text-[14px] leading-[22px] text-[#4b5563]">
              Hi {primaryContactName},
            </Text>
            <Text className="mb-0 mt-[10px] text-[14px] leading-[22px] text-[#4b5563]">
              We received {organizationName}&apos;s request for HOMS access.
              Our operations team reviews new workspace requests manually before
              provisioning a tenant and inviting the first admin user.
            </Text>
            <Section className="mt-[18px] rounded-[12px] bg-[#f9fafb] px-[16px] py-[14px]">
              <Text className="m-0 text-[13px] font-semibold text-[#111827]">
                What happens next
              </Text>
              <Text className="m-0 mt-[8px] text-[14px] leading-[22px] text-[#4b5563]">
                We&apos;ll review your request and follow up by email with next
                steps. No account or tenant is created automatically at this
                stage.
              </Text>
            </Section>
            <Text className="mb-0 mt-[20px] text-[14px] leading-[22px] text-[#4b5563]">
              If you need to add context before we reply, respond to this email
              and the team will see it in the request thread.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
