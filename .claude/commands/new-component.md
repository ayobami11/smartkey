# Create a new SmartKey component

Build a new component in `src/components/smartkey/`.

Arguments: `$ARGUMENTS` (component name in PascalCase, e.g. `LiveZoneCounter`)

Steps:

1. Confirm the component is not already in `src/components/smartkey/`. If similar exists, ask whether to extend rather than duplicate.
2. Confirm the component is documented in DESIGN.md (look under "Components"). If not, propose the addition before coding.
3. Compose from shadcn/ui primitives where possible. Wrap with SmartKey-specific behaviour.
4. Use Tailwind utility classes mapped to DESIGN.md tokens. No hardcoded values.
5. Define a `type` for props. Use named export. No default export.
6. Add JSDoc with one-line description and a usage example.
7. Co-locate a unit test `<Name>.test.tsx` covering: default render, every variant prop, keyboard interaction (if interactive), and reduced-motion.
8. If the component has visual variants, add a Storybook story (if Storybook is in the repo).
9. Run `bun run typecheck && bun run lint && bun run test` before declaring done.

Show me the plan before writing any code.
