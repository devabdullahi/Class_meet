# Class Meet

A course-scoped study group finder for university students.

Students sign up with their university email, add the courses they are taking,
and browse the open study groups for those exact courses — with meeting day,
time, location, and remaining seats shown. If nothing fits, they create a group
in the same place, and other students in that course can find it.

The problem we are solving is **discovery, not communication**. Students already
have good tools for talking to people they know (GroupMe, Discord). None of them
has a directory, so joining requires an invite from someone you already know —
which the newest, commuting, and part-time students do not have.

---

## Course

CSE 3311 — Software Engineering II
The University of Texas at Arlington

## Team

| Name | GitHub |
|---|---|
| Abdullahi Abdullah Khalafalla | @devabdullahi |
| Phyo Ei Ko | @pek8504 |
| Jesus Martinez | |
| Shofi Shrestha | |

## Deliverables

| Phase | Document | Tag |
|---|---|---|
| Inception | `docs/ClassMeet_Inception.pdf` | `v0.1.0-inception` |
| Inception | `docs/ClassMeet_Inception_Slides.pptx` | `v0.1.0-inception` |

**The version to review for the inception submission is `v0.1.0-inception`.**

Per the assignment, no application code exists at the inception phase.

## Planned stack

| Layer | Choice |
|---|---|
| Frontend | React |
| Backend | Node.js |
| Database | PostgreSQL |

Deliberately conventional, so that documentation and examples are abundant —
this is a mitigation for the risk that none of us has built a full-stack
application end to end before.

## Planned feature set

| ID | Feature | Priority |
|---|---|---|
| F1 | University email sign-up and verification | Must have |
| F2 | Student profile (major, year, campus, study style) | Must have |
| F3 | Course selection from a controlled catalog | Must have |
| F4 | Course-scoped group discovery with filters | Must have |
| F5 | Create a group (day, time, location, size cap, goal) | Must have |
| F6 | Join or request to join | Must have |
| F7 | Group page (roster, sessions, announcements) | Must have |
| F8 | Report and moderation tools | Should have |
| F9 | In-app group messaging | Could have |
| F10 | Polls, shared notes, to-do lists, exam dates | Not this release |

## Roadmap

| Iteration | Delivers | Retires |
|---|---|---|
| 1 — Elaboration | Sign-up, course selection, browse seeded groups | Catalog data quality, email verification |
| 2 — Construction I | Create group, join / request, profiles | Cold start — ends with a live pilot in one real course section |
| 3 — Construction II | Group page, moderation tools | Harassment and moderation |
| 4 — Transition | Hardening, deployment | Hosting reliability |

## Repository layout

```
docs/     project deliverables (inception document, slides)
```

Application source will be added from iteration 1 onward.
