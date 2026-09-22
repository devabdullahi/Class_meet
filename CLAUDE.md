# Long-Term Code Hygiene & Maintenance Instructions

## Purpose
You are responsible not only for making the requested code work, but also for keeping the codebase maintainable, understandable, secure, and healthy over the long term.

Treat every code change as a contribution to a codebase that may need to be maintained for many years.

## 1. General Principle
Always optimize for:

- Correctness
- Readability
- Maintainability
- Testability
- Simplicity
- Security
- Consistency
- Low unnecessary coupling
- Clear ownership of responsibilities
- Ease of future modification

Do not optimize only for the shortest implementation or the fastest way to satisfy the current request.

Prefer solutions that make future changes easier.

Before making a change, ask:

Will this code still be easy for another developer to understand and modify several years from now?

## 2. Keep Code Simple
Prefer simple, explicit code over clever or overly abstract code.

Avoid:

- Clever one-liners that reduce readability
- Unnecessary abstractions
- Premature generalization
- Deep inheritance hierarchies
- Excessive indirection
- Complex control flow
- Large conditional blocks
- Functions that do many unrelated things
- Framework-specific tricks when a simpler solution exists

Do not introduce an abstraction merely because it is technically possible.

Introduce abstractions when they provide a clear benefit such as:

- Isolating changing behavior
- Reducing meaningful duplication
- Enforcing a meaningful boundary
- Improving testability
- Separating responsibilities

## 3. Keep Responsibilities Small
Each function, class, module, and service should have a clear responsibility.

Prefer:

small function
    ↓
clear purpose
    ↓
easy to test
    ↓
easy to change

Avoid:

large function
    ↓
many responsibilities
    ↓
many dependencies
    ↓
hard to test
    ↓
hard to modify

When modifying a large or overly complex area, consider extracting a responsibility if doing so makes the code materially easier to understand.

Do not perform massive unrelated refactors simply because you encountered imperfect code.

## 4. Minimize Coupling
Avoid unnecessary dependencies between unrelated parts of the system.

Prefer clear boundaries between:

- UI / presentation
- Business logic
- Persistence
- External services
- Infrastructure
- Configuration
- Domain logic

Do not allow business logic to become tightly coupled to infrastructure when a clean boundary is practical.

When introducing a dependency, consider:

- Who depends on it?
- What happens if it changes?
- Can this component be tested independently?
- Does this create a dependency cycle?
- Will this make future changes more expensive?

## 5. Naming
Use descriptive names.

Names should communicate intent rather than implementation details.

Prefer:

calculateOrderTotal()

over:

process()

Prefer:

isPaymentAuthorized

over:

flag

Avoid meaningless names such as:

data
temp
thing
obj
stuff
helper
manager
misc

unless the surrounding context makes their meaning genuinely clear.

Do not use abbreviations unless they are well-established within the project or domain.

## 6. Comments
Do not write comments that merely repeat the code.

Bad:

// Increment counter
counter++;

Good:

// The upstream API expires requests after 15 minutes.
// Longer retries can result in duplicate processing.

Comments should primarily explain:

- Why something exists
- Why a non-obvious decision was made
- Important constraints
- External system behavior
- Workarounds
- Business rules
- Compatibility requirements
- Performance considerations
- Security considerations

If a comment says something is temporary, ensure there is a concrete reason or tracking item where appropriate.

Never use comments as an excuse for unnecessarily confusing code.

## 7. Avoid Dead Code
Remove:

- Unused functions
- Unused imports
- Unreachable code
- Obsolete configuration
- Deprecated internal APIs
- Commented-out implementations
- Unused variables
- Abandoned experiments

Do not preserve dead code merely because it might be useful someday.

Version control already preserves historical implementations.

## 8. Avoid Duplication
Do not blindly apply DRY everywhere.

First determine whether duplicated code represents the same concept.

If multiple pieces of code genuinely implement the same rule, consider extracting the shared behavior.

However, do not create complicated abstractions simply to eliminate a few lines of duplication.

Prefer:

Duplication that is easy to understand

over:

An abstraction that is difficult to understand

when the duplicated code is not actually the same concept.

## 9. Complexity
Actively prevent unnecessary complexity.

Watch for:

- Deep nesting
- Very long functions
- Very large classes
- Excessive parameters
- Large switch / if chains
- Circular dependencies
- Hidden side effects
- Global mutable state
- Complex inheritance
- Excessive configuration
- Multiple sources of truth

When complexity is encountered, determine whether it is:

- Necessary complexity caused by the domain, or
- Accidental complexity caused by the implementation.

Remove accidental complexity whenever practical.

## 10. Testing
Every meaningful behavior change should have appropriate automated tests.

Prefer tests that verify behavior rather than implementation details.

Use the appropriate level of testing:

- Unit tests for isolated logic
- Integration tests for component interactions
- End-to-end tests for critical user workflows
- Regression tests for previously discovered bugs

When fixing a bug:

reproduce bug
    ↓
write regression test
    ↓
fix bug
    ↓
verify test

Do not remove or weaken tests merely to make a change pass.

## 11. Do Not Sacrifice Tests for Speed
Never solve a problem by:

- Disabling tests
- Removing assertions
- Broadly increasing timeouts without understanding why
- Mocking everything
- Ignoring failing tests
- Marking tests as skipped without a documented reason

If a test is failing because the existing test is incorrect, fix the test.

If the implementation is incorrect, fix the implementation.

If the environment is responsible, clearly identify the environmental problem.

## 12. Formatting and Static Analysis
Follow the project's existing:

- Formatter
- Linter
- Type checker
- Static analysis rules
- Naming conventions
- Import conventions

Use automated tooling whenever available.

Do not manually fight the formatter.

Do not introduce formatting conventions that conflict with the existing project.

If automated formatting or linting exists, run it after making changes.

## 13. Code Review Mindset
Before considering a change complete, review your own work as if you were reviewing another developer's pull request.

Check:

- Is the implementation understandable?
- Is the design appropriate?
- Is the change unnecessarily complex?
- Are responsibilities clear?
- Are there hidden side effects?
- Are errors handled correctly?
- Are tests sufficient?
- Is documentation needed?
- Did the change introduce duplication?
- Did it increase coupling?
- Did it introduce technical debt?
- Did it leave nearby code worse than before?

The goal is not perfection.

The goal is:

Leave the codebase at least as healthy as you found it, and preferably healthier.

## 14. Keep Changes Focused
Do not mix unrelated refactoring with feature work unless necessary.

Prefer:

Change:
Implement customer export

rather than:

Change:
Implement customer export
+ rewrite authentication
+ rename 200 files
+ change database architecture
+ reformat entire project

Keep changes:

- Focused
- Reviewable
- Testable
- Reversible

If a larger refactor is genuinely required, break it into logical incremental steps when possible.

## 15. Refactor Incrementally
Do not wait until the codebase becomes unmaintainable before refactoring.

When working in an area, improve obvious problems when the improvement is:

- Local
- Low risk
- Clearly beneficial
- Related to the current change

Example:

Before:
large function
    ↓
modify function
    ↓
extract obvious responsibility
    ↓
add tests
    ↓
make requested change

Do not perform large speculative refactors without a clear reason.

## 16. Technical Debt
Treat technical debt as something that must be visible.

When intentionally introducing a shortcut, determine:

- Why it is necessary
- What the future cost is
- What could cause the debt to become important
- How it should eventually be removed

Do not leave vague TODOs such as:

TODO: fix this later

Prefer actionable TODOs:

TODO:
Replace legacy payment adapter after API v3 migration.
Tracked by ISSUE-1234.

Do not accumulate technical debt silently.

When encountering significant existing debt, mention it separately from the requested implementation rather than silently expanding the scope.

## 17. Dependencies
Keep dependencies healthy.

Before adding a dependency, consider:

- Is it actually necessary?
- Is existing functionality sufficient?
- Is the project actively maintained?
- Is the dependency appropriately licensed?
- Does it introduce security or supply-chain risk?
- Does it significantly increase project complexity?
- Will it be difficult to remove later?

Prefer existing project dependencies when they adequately solve the problem.

Avoid adding a dependency for trivial functionality that can reasonably be implemented without one.

Keep dependencies updated according to the project's maintenance process.

Do not perform large dependency upgrades unrelated to the task unless necessary.

## 18. Security
Treat security as part of code quality.

Never:

- Hard-code secrets
- Commit API keys
- Log credentials
- Log sensitive personal information unnecessarily
- Disable security checks to make development easier
- Trust unvalidated external input
- Construct unsafe queries or commands
- Bypass authentication or authorization without a deliberate design reason

Validate data at appropriate boundaries.

Use established security mechanisms instead of inventing custom cryptography or authentication systems.

When dealing with sensitive functionality, favor established, well-tested libraries and patterns.

## 19. Error Handling
Handle errors deliberately.

Do not:

catch everything
    ↓
ignore error

Avoid empty exception handlers unless there is a documented reason.

Errors should either:

- Be handled appropriately
- Be transformed into useful domain errors
- Be propagated to a layer capable of handling them
- Be logged when appropriate

Do not expose internal implementation details or secrets through user-facing errors.

## 20. Logging
Logs should help diagnose problems without creating unnecessary noise or exposing sensitive information.

Prefer structured, meaningful logging.

Log:

- Important state transitions
- Significant failures
- External service failures
- Security-relevant events
- Useful diagnostic context

Do not log:

- Passwords
- API keys
- Authentication tokens
- Sensitive personal data
- Entire request bodies unless explicitly justified

Avoid excessive debug logging in production paths.

## 21. Configuration
Keep configuration separate from business logic.

Avoid scattering magic values throughout the code.

Prefer named configuration:

PAYMENT_TIMEOUT_SECONDS
MAX_UPLOAD_SIZE
SESSION_DURATION

over unexplained constants:

900
10485760
86400

When a value represents an important business or system rule, make its meaning explicit.

## 22. Single Source of Truth
Avoid maintaining the same information in multiple places.

If a value or rule has one authoritative source, other components should derive their information from that source where practical.

Watch for:

same business rule
    ↓
implemented in 4 different places

This is a maintenance risk.

When changing a business rule, there should ideally be one obvious place to make the change.

## 23. Documentation
Maintain documentation alongside meaningful system changes.

Document:

- Architecture
- Important workflows
- External integrations
- Deployment requirements
- Operational procedures
- Non-obvious constraints
- Important design decisions

When architecture changes, update the relevant architecture documentation.

When a decision has meaningful long-term consequences, consider recording an Architecture Decision Record (ADR):

# ADR-001: Use PostgreSQL

## Context

Why this decision was necessary.

## Decision

What was chosen.

## Alternatives

What else was considered.

## Consequences

What becomes easier and harder as a result.

## 24. Preserve Existing Conventions
Before introducing a new pattern, inspect the existing codebase.

Look for:

- Existing utilities
- Existing abstractions
- Existing error types
- Existing API patterns
- Existing testing patterns
- Existing naming conventions
- Existing dependency choices
- Existing configuration patterns

Prefer consistency with established conventions unless there is a compelling reason to change them.

Do not introduce three different ways of solving the same problem.

## 25. Backward Compatibility
Before changing a public interface, consider:

- Existing callers
- APIs
- Database schemas
- Configuration
- Stored data
- External integrations
- Scripts
- CLI usage
- Deployment environments

Avoid breaking changes unless they are intentional and properly managed.

For migrations, prefer incremental strategies when practical:

old
 ↓
support old + new
 ↓
migrate consumers
 ↓
remove old

rather than:

old
 ↓
break everything
 ↓
hope all consumers migrate

## 26. Database Changes
Treat database schemas as long-lived contracts.

For schema changes:

- Consider existing data.
- Consider existing application versions.
- Consider rollback.
- Consider migration order.

Avoid destructive changes without a deliberate migration strategy.

Test migrations.

Consider indexes and query performance.

Avoid silently changing the meaning of existing data.

For significant changes, prefer expand-and-contract migrations:

1. Add new structure
2. Deploy compatible code
3. Migrate data
4. Switch reads/writes
5. Verify
6. Remove old structure later

## 27. Performance
Do not prematurely optimize.

First prioritize:

correctness
→ clarity
→ maintainability
→ measurement
→ optimization

When optimizing:

- Measure before changing.
- Identify the actual bottleneck.
- Make the smallest effective change.
- Preserve correctness.
- Add tests or benchmarks where appropriate.
- Document non-obvious performance decisions.

Do not make code substantially harder to maintain for an unmeasured performance hypothesis.

## 28. Observability
For important production systems, consider whether failures can actually be diagnosed.

Important components should have appropriate:

- Logging
- Metrics
- Tracing
- Health checks
- Error reporting

Focus on information that helps answer:

- What failed?
- Where did it fail?
- Why did it fail?
- Who or what was affected?
- How often is it happening?

## 29. Migration Strategy
For major architectural or dependency changes, prefer incremental migration.

Use patterns such as:

introduce new implementation
        ↓
support old + new
        ↓
migrate consumers
        ↓
verify
        ↓
remove old implementation

Avoid "big bang" rewrites unless there is a strong technical reason.

When proposing a large rewrite, first determine whether incremental modernization can accomplish the same objective with lower risk.

## 30. Scope Discipline
Do not silently expand the task.

If the requested change exposes unrelated problems:

- Complete the requested work safely.
- Fix closely related issues when appropriate.
- Identify significant unrelated problems separately.
- Recommend a follow-up task when necessary.

Do not turn every feature request into a rewrite.

## 31. Before Completing Any Change
Perform this checklist:

- [ ] Code is readable
- [ ] Responsibilities are clear
- [ ] Naming is meaningful
- [ ] No unnecessary duplication
- [ ] No unnecessary abstraction
- [ ] No obvious dead code
- [ ] Error handling is appropriate
- [ ] Security implications considered
- [ ] Tests added or updated
- [ ] Existing tests still pass
- [ ] Formatter applied
- [ ] Linter/static analysis passes
- [ ] No unnecessary dependencies added
- [ ] Documentation updated if needed
- [ ] Existing conventions followed
- [ ] No accidental API/schema breaking changes
- [ ] Technical debt introduced intentionally, if any
- [ ] Change is appropriately scoped

## 32. When You Encounter Poor Existing Code
Do not automatically rewrite it.

First determine:

Is it relevant to the current task?
        │
        ├── No → Leave it alone or report separately.
        │
        └── Yes
             ↓
       Can it be safely improved?
             │
             ├── Yes → Make a focused improvement.
             │
             └── No → Preserve behavior and minimize
                       additional complexity.

When modifying legacy code, prioritize preserving existing behavior unless the task explicitly requires changing it.

Add characterization or regression tests before making risky changes when practical.

## 33. Default Decision Hierarchy
When choosing between implementations, generally prefer:

1. Correct
2. Secure
3. Simple
4. Readable
5. Testable
6. Consistent with the codebase
7. Loosely coupled
8. Easy to change
9. Efficient
10. Clever

Do not sacrifice the first items merely to optimize the last ones.

## 34. Long-Term Principle
Your responsibility is not merely:

"Make the requested feature work."

Your responsibility is:

Make the requested change while preserving and improving the long-term health of the codebase.

Every change should ideally move the project toward:

simple
    ↓
understandable
    ↓
testable
    ↓
observable
    ↓
secure
    ↓
loosely coupled
    ↓
easy to modify
    ↓
easy to maintain

Prefer continuous small improvements over periodic large rewrites.

Leave the codebase better than you fund it, but do not perform unrelated work merely for the sake of improvement.