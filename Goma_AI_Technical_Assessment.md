# Goma AI Technical Assessment

## AI WhatsApp Renewal Notification Agent

### Time Limit

6 hours

### Tech Stack

Use any language/framework.

**Preferred stack (optional):**

- Node.js (NestJS preferred)
- PostgreSQL
- Redis (optional)
- Docker
- OpenAI/Claude API
- Meta WhatsApp Cloud API (mock is acceptable)

---

## Background

You are building an internal automation tool for a financial advisory company.

Every month, the Operations team exports an Excel spreadsheet containing policy renewals.

The system should automatically notify the assigned financial adviser via WhatsApp.

**The notification is sent only to the adviser, never to the client.**

---

## Functional Requirements

### Part 1 — Upload Excel

Create an endpoint:

```
POST /renewals/upload
```

**Accept:**

- XLSX
- CSV

**Example:**

| Adviser | Adviser Phone | Client | Policy | Renewal Date | Premium |
|---------|---------------|--------|--------|--------------|---------|
|         |               |        |        |              |         |

**Validate:**

Required fields:

- Adviser
- Adviser Phone
- Client
- Policy
- Renewal Date

**Return:**

```
228 Valid
7 Invalid
Download Error Report
```

---

### Part 2 — Store Records

Store all valid rows.

**Suggested schema:**

**Renewal**

- id
- clientName
- policyName
- renewalDate
- premium
- adviserName
- adviserPhone
- status
- createdAt

---

### Part 3 — AI Message

Generate a WhatsApp reminder.

**Example:**

> Hi Sarah 👋
>
> Your client John Tan has a policy renewal on 15 August 2026.
>
> Policy: Elite Whole Life
>
> Premium: S$2,800
>
> Please contact your client before the renewal date.

Use an LLM.

---

### Part 4 — Queue

Messages should not send immediately.

Implement a background queue.

**Status:**

- Pending
- Processing
- Sent
- Failed

---

### Part 5 — WhatsApp Service

Implement:

```
WhatsAppService.send()
```

Actual Meta integration is optional.

Mock implementation is acceptable.

---

### Part 6 — Dashboard API

Create:

```
GET /renewals
```

**Returns:**

- renewal
- status
- sentAt
- adviser
- client

**Support:**

- `?page=`
- `?status=`
- `?adviser=`

---

## Technical Requirements

**Must include:**

- Clean architecture
- Validation
- Error handling
- Logging
- Environment variables
- Docker Compose
- README

**Nice-to-have:**

- Duplicate detection
- Retry failed messages
- Rate limiting
- Scheduling
- Unit tests
- Swagger/OpenAPI

---

## AI Prompt

Candidate should write an appropriate prompt.

Do NOT provide one.

We want to evaluate prompt engineering ability.

---

## Deliverables

- GitHub repository
- README containing:
  - Setup
  - Assumptions
  - Architecture
  - Trade-offs
  - Improvements

---

## Evaluation Criteria

| Category | Weight |
|----------|--------|
| Code quality | 25% |
| Architecture | 20% |
| AI integration | 15% |
| API design | 15% |
| Validation & error handling | 10% |
| Documentation | 10% |
| Product thinking | 5% |
