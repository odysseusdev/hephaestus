import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * Flat ESLint config. Lean: the recommended TypeScript ruleset plus a couple of
 * project conventions (explicit types are encouraged, unused vars are errors).
 */
export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "content/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/explicit-function-return-type": [
        "error",
        { allowExpressions: true },
      ],
    },
  },
);
