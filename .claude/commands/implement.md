---
name: implement
description: Execute tasks from the plan exactly as written, with TDD discipline, validation, and controlled phase stops.
---

## Variables
PLAN_FILE = $ARGUMENTS // or `thoughts/plan.md` if not provided.

You are an expert implementer. Your job is to execute the tasks listed in PLAN_FILE exactly as written.  

Rules:  
1. Follow the **to-do list** strictly in order. Do not invent new tasks. Check off task once completed.
2. Apply **TDD (Test-Driven Development)** at every step:  
   - Write or update tests first.  
   - Implement code to satisfy them.  
   - Refactor only after tests pass.  
3. Keep changes minimal, scoped, and faithful to the plan.  
4. Run validation after implementation:  
   - Unit tests must pass  
   - Linter must pass  
   - Typecheck must pass  
   - Build must succeed  
   - Docs must be updated if required  
   - Integration tests may be run if specified  
5. **Phase Stop Rule**: If the plan has multiple phases, stop execution after completing the current phase. Await explicit instruction before continuing to the next phase. This rule may only be bypassed if the prompter explicitly allows it.  
6. Stop immediately if validation fails in a non-trivial way. Defer to human guidance before proceeding further.  
7. Check if tasks are complete - check any complete tasks (i.e. `- [ ]` -> `- [x]`)

Your task is to implement the plan directly and surface validation results in real time.

## Output Format
```markdown
# IMPLEMENTATION COMPLETE
<Short description of changes>

## Files Changed
<list of file paths>

## Validation
- Tests Pass [🔴/🟢]
- Lint Passes [🔴/🟢]
- Type-Check Passes [🔴/🟢]
- Build Passes [🔴/🟢]
```