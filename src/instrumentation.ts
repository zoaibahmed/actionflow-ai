export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NODE_ENV === "production"
  ) {
    const { productionConfiguration } = await import("./lib/production-config");
    const result = productionConfiguration(process.env);
    if (result.errors.length)
      throw new Error(
        "Production configuration invalid: " + result.errors.join("; "),
      );
    for (const warning of result.warnings)
      console.warn("ActionFlow configuration: " + warning);
  }
}
