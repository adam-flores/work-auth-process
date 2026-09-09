# Business Case: Improving the Internal Work Authorization Process

**Status:** Draft — initial problem framing
**Last updated:** 2026-09-08

> This document is the source of truth for *why* this project exists and *what* it must
> achieve. It is intentionally solution-agnostic: it describes the problem and the desired
> outcome, not the implementation. Sections marked **[Derived]** were inferred while
> structuring the original project overview and have not yet been validated with
> stakeholders.

---

## 1. Overview

| | |
|---|---|
| **Project title** | Improving the Internal Work Authorization Process |
| **Organization** | A large aerospace manufacturer (anonymized) |
| **Industry** | Aerospace and Defense |
| **Scope** | The internal work authorization form and the process surrounding it |

The organization operates within the aerospace and defense industry, supporting complex
engineering, manufacturing, and operational activities. Employees may provide support across
departments, requiring appropriate documentation and authorization of work performed outside
their primary department.

---

## 2. Operational Context

When an employee supports work for another department within the organization, an internal
work authorization form must be completed to document the work and obtain the necessary
approvals.

Internal work authorizations serve several control functions:

- **Cost control between legal entities.** They allow the organization to control and
  manage costs across legal entities, especially where those entities use different reporting systems.
- **Contract compliance.** This control is particularly important for foreign restricted
  government contracts, to ensure costs are properly tracked and allocated within US contract
  requirements.
- **Work authorization.** Accurate completion of the form is an important step in authorizing
  cross-departmental work and allowing employees to proceed with their assigned activities.

Because the form sits upstream of both cost allocation and the start of work, errors in it
propagate into two different kinds of harm: compliance/accounting exposure and schedule delay.

---

## 3. Problem Statement

Employees and teams frequently experience difficulty completing the internal work
authorization form accurately, due to:

- Limited training on the form and the process around it
- Unclear guidance on how fields should be completed and what they mean
- A lack of easily accessible process support at the moment the form is being filled out

As a result, employees rely on a small number of knowledgeable individuals for assistance.
This produces a recurring cycle of repeated questions, corrections, resubmissions, and
one-on-one explanations.

**Root cause framing [Derived]:** the process knowledge required to complete the form
correctly exists, but it lives in people rather than in the form or in accessible guidance.
Every submission therefore risks becoming a support interaction.

---

## 4. Impact

The current process creates cost and risk in four ways:

**Operational inefficiency.** Time is consumed answering repetitive questions, reviewing
incorrect forms, and managing corrections and resubmissions.

**Schedule delay.** Incomplete or inaccurate forms can delay work authorization and
potentially delay engineers from beginning or continuing work associated with a contract.

**Reduced productivity of experts.** Knowledgeable employees repeatedly provide individual
support rather than focusing on their primary responsibilities.

**Organizational key-person dependency.** Process knowledge is concentrated among a limited
number of employees, creating inconsistency in how the process is applied and dependency on
those individuals.

---

## 5. Desired Outcome

Improve the **accuracy, consistency, and efficiency** of the internal work authorization
process so employees can successfully complete forms with minimal assistance.

Specifically, a better process would:

1. Reduce submission errors and rework
2. Decrease processing time
3. Minimize dependency on individual subject-matter experts
4. Enable engineers to receive authorization and proceed with contract-related work more
   efficiently

---

## 6. Candidate Success Measures **[Derived]**

Proposed metrics for judging whether the prototype achieves the desired outcome. Baselines
are unknown and must be established before any target is credible.

| # | Measure | Baseline | Target | Ties to outcome |
|---|---|---|---|---|
| M1 | First-pass acceptance rate (submitted forms requiring no correction) | TBD | Increase | Reduce errors and rework |
| M2 | Cycle time from form start to approved authorization | TBD | Decrease | Decrease processing time |
| M3 | Number of resubmissions per authorization | TBD | Decrease | Reduce rework |
| M4 | SME support interactions per authorization | TBD | Decrease | Reduce expert dependency |
| M5 | Share of forms completed without SME contact | TBD | Increase | Minimal assistance |
| M6 | Time-to-competence for a first-time submitter | TBD | Decrease | Consistency, reduced training gap |

---

## 7. Stakeholders **[Derived]**

| Stakeholder | Interest in the process |
|---|---|
| Submitting employees / engineers | Complete the form correctly and start work without delay |
| Subject-matter experts | Stop absorbing repetitive one-on-one support requests |
| Approvers / department managers | Receive complete, accurate forms they can act on |
| Finance / cost accounting | Correct cost allocation across legal entities and reporting systems |
| Contracts / compliance | Costs tracked and allocated within US contract requirements, especially on foreign restricted government contracts |

---

## 8. Constraints and Assumptions **[Derived]**

**Constraints**

- The aerospace and defense operating environment carries compliance obligations; anything
  touching foreign restricted government contracts is subject to US contract requirements
  and likely export-control considerations.
- Legal entities involved may use **different reporting systems**, so a solution cannot
  assume one common system of record.
- Any real-world deployment would be subject to corporate IT, security, and records-retention
  policy. This repository is a **class prototype** and is not a deployed system.

**Assumptions**

- The form itself is a legitimate and necessary control; the goal is to make it easier to
  complete correctly, not to eliminate it.
- The information needed to complete the form correctly is knowable at the time of
  submission.
- Improving guidance at the point of entry is a viable lever, since the failure mode is
  knowledge access rather than employee unwillingness.

---

## 9. Out of Scope

- Changing the underlying cost-accounting or contract-compliance requirements
- Replacing the legal entities' existing reporting systems
- Handling real company data, forms, contract identifiers, or personnel
  information (see repository README)

---

## 10. Open Questions

To be resolved with stakeholders before or during solution design.

1. What are the actual fields on the current form, and which ones drive the majority of
   errors?
2. What is the current volume of authorizations per period, and the current error rate?
3. Who approves an authorization today, and how many approval steps exist?
4. Where does the form live today (paper, PDF, workflow tool, ERP), and what can integrate
   with it?
5. What is the measured cost of a single rework cycle, in SME time and in schedule delay?
6. Which requirements are compliance-mandated versus organizational convention?
7. What distinguishes a foreign restricted government contract submission from a standard
   internal one?

---

## Appendix A: Original Project Overview

The source input for this business case, reproduced with the organization's name replaced by
a generic reference. Otherwise unaltered.

> **Project Title: Improving the Internal Work Authorization Process**
>
> **Organization / Industry — A large aerospace manufacturer | Aerospace and Defense**
> The organization operates within the aerospace and defense industry, supporting complex
> engineering, manufacturing, and operational activities. Employees may provide support
> across departments, requiring appropriate documentation and authorization of work performed
> outside their primary department.
>
> **Operational Context**
> When an employee supports work for another department within the organization, an internal
> work authorization form must be completed to document the work and obtain the necessary
> approvals. Internal work authorizations help the organization control and manage costs
> between legal entities, especially when they use different reporting systems. This control is particularly
> important for our foreign restricted government contracts to ensure costs are properly
> tracked and allocated within US contract requirements. Accurate completion of this form is
> an important step in authorizing cross-departmental work and allowing employees to proceed
> with their assigned activities.
>
> **The Problem**
> Employees and teams frequently experience difficulty completing the internal work
> authorization form accurately due to limited training, unclear guidance, and a lack of
> easily accessible process support. As a result, employees often rely on a small number of
> knowledgeable individuals for assistance, leading to repeated questions, corrections,
> resubmissions, and one-on-one explanations.
>
> **Impact**
> The current process creates operational inefficiencies through time spent answering
> repetitive questions, reviewing incorrect forms, and managing corrections and resubmissions.
> Incomplete or inaccurate forms can delay work authorization and potentially delay engineers
> from beginning or continuing work associated with a contract. The process also reduces
> employee productivity by requiring knowledgeable employees to repeatedly provide individual
> support rather than focus on their primary responsibilities. Additionally, process knowledge
> is concentrated among a limited number of employees, creating inconsistency and dependency
> within the organization.
>
> **Desired Outcome**
> Improve the accuracy, consistency, and efficiency of the internal work authorization process
> so employees can successfully complete forms with minimal assistance. A better process would
> reduce submission errors and rework, decrease processing time, minimize dependency on
> individual subject-matter experts, and enable engineers to receive authorization and proceed
> with contract-related work more efficiently.
