---
name: plan
description: Generate a deterministic, stage-based execution plan from approved research, including testing strategy.
---

## Variables
RESEARCH_FILE = $ARGUMENTS // or `thoughts/research.md` if not provided.
OUTPUT_FILE = `<same folder as RESEARCH_FILE>/plan.md`

You are an expert software planner. Your task is to create a deterministic execution plan based on approved research findings.  

Steps:  
1. Read the RESEARCH_FILE.
2. Translate the **Problem Statement** and findings into a structured plan.  
3. Break work into **Stages** (e.g., Scaffold → Tests → Implement → Wire-up → Docs).  
4. Inside each stage, define small, testable tasks.  
   - Use deterministic commands where possible (e.g., CLI scaffolds).  
   - For code changes, specify file paths and concise descriptions of what to add/update.  
   - Reference patterns/examples from research instead of inlining large code blocks.  
5. Mark tasks that can be run in parallel with **(P)**.  
6. Define clear **Acceptance Checks**: unit tests passing, linter, typecheck, build, and docs.  
7. Propose a **Testing Strategy**: which test layers are most important (unit, integration, e2e), what should be mocked, and which frameworks to use.  
8. Do not include frontmatter in the output.  

**Output strictly in Markdown** to OUTPUT_FILE with the following structure:  

```markdown
# Plan
<High level description of the plan>

## Phase X - <phase short name>
<Short phase description>

### Tasks
- [ ] atomic task (run command, create file, etc)
- [ ] [P] parallel-capable task
...
- [ ] Run tests, linter, type-check, and build

### Phase Acceptance Checks
- Unit tests pass
- Linter passes
- Typecheck passes
- Build passes
- Docs updated (ReadMe.md specifically)

### Testing Strategy
Utilize TDD (Red, Green, Refactor) religiously.
<Proposed approach: which tests, what to mock, which frameworks>
```