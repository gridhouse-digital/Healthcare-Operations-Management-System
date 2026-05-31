# HOMS Existing Platform Summary

## What HOMS Does Today

HOMS is currently a tenant-aware HR, onboarding, training, and compliance application for healthcare staffing operations. It already supports the main office-side workflow from applicant intake through offer handling, employee record management, onboarding status, LearnDash training visibility, and recurring compliance tracking.

In practical terms, the current platform is strongest at:

- collecting and reviewing applicants
- creating and sending offers
- converting applicants into employee records
- syncing employee and course data from WordPress and LearnDash
- showing onboarding training progress
- managing recurring compliance rules and cycles
- handling tenant settings, user roles, and connector administration

## Who It Serves Today

The current app mainly serves internal agency operators:

- platform admins
- tenant admins
- HR admins
- hiring and onboarding staff

It is currently an operations-side system first. It is not yet a broader field-operations platform, caregiver workspace, family portal, billing system, or EVV system.

## Major Current Modules

### Core Platform

The app already has tenant-aware access, settings, connector management, and access-request intake. This is the base layer that other HOMS capabilities sit on.

### Hiring And Applicant Management

The app supports JotForm-driven applicant intake, applicant review, offer creation, and public offer response flows.

### Employee Management

Employees are now managed as unified records in the `people` table, with status, source tracking, and links back to applicants where available.

### Training And Compliance

The app syncs LearnDash course progress, shows onboarding training status, stores compliance-grade training history, and supports recurring compliance rules and cycle management.

### Admin And Connector Operations

The app includes settings pages for connector setup, LearnDash mappings, training rules, tenant users, and access-request review.

## Current Limitations

- Applicant to offer to employee conversion is functional, but the lifecycle is not yet fully consolidated into one clean path.
- Employee status still depends on sync timing and onboarding-course completion checks.
- Training and recurring compliance visibility still depend on correct LearnDash group and rule alignment.
- Audit logging exists in the backend, but there is no full standalone audit-review product surface yet.
- The platform is still one application with domain clusters, not yet a physically modular HOMS platform.

## What This Sets Up Next

The current HOMS platform is already a credible foundation for modular expansion. It has enough real structure in core platform, hiring, employee management, and training/compliance to be reorganized into cleaner domains without pretending those future modules already exist.

That makes the next step less about inventing a platform from zero and more about:

- separating existing domains more cleanly
- fixing the remaining lifecycle inconsistencies
- then layering in new domains such as care operations, caregiver workflows, EVV, and later billing or payroll

The important product truth is simple: HOMS today is already more than an applicant tracker, but it is not yet the full healthcare operations platform described in the long-range roadmap.
