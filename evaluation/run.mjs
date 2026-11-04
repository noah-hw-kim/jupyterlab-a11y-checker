#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  runEvaluation,
  runValidation,
  EvaluationRunnerError,
} from "./runner.mjs";

async function main() {
  let values;
  try {
    ({ values } = parseArgs({
      strict: true,
      options: {
        config: { type: "string" },
        experiment: { type: "string" },
        source: { type: "string" },
        "source-dir": { type: "string" },
        validate: { type: "boolean", default: false },
        output: { type: "string" },
        case: { type: "string", multiple: true },
        strategy: { type: "string", multiple: true },
        "dry-run": { type: "boolean", default: false },
      },
    }));
  } catch {
    throw new EvaluationRunnerError(
      "Invalid arguments. Use --config, --experiment, --source, --source-dir, --validate, --output, --case, --strategy, and/or --dry-run.",
    );
  }
  if (values["source-dir"] && !values.source)
    throw new EvaluationRunnerError("--source-dir requires --source.");
  const runner =
    values.validate || values.source !== undefined
      ? runValidation
      : runEvaluation;
  const result = await runner({
    configPath: values.config,
    experimentId: values.experiment,
    sourceId: values.source,
    sourceDir: values["source-dir"],
    outputDir: values.output,
    cases: values.case,
    strategies: values.strategy,
    dryRun: values["dry-run"],
  });
  console.log(JSON.stringify(result, null, 2));
  if (
    ["blocked", "rate-limited"].includes(result.stopped) ||
    result.results?.some((r) => r.outcome !== "succeeded")
  )
    process.exitCode = 1;
}
main().catch((error) => {
  console.error(
    error instanceof EvaluationRunnerError
      ? error.message
      : "Evaluation stopped unexpectedly. No further requests were sent.",
  );
  process.exitCode = 1;
});
