export interface ModelDescriptor {
  id?: string;
  family?: string;
  version?: string;
  vendor?: string;
  name?: string;
}

function normalize(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function includesAnyField(model: ModelDescriptor, needle: string): boolean {
  const candidates = [model.id, model.family, model.version, model.name];
  return candidates.some((candidate) => normalize(candidate).includes(needle));
}

export function selectPreferredModel<T extends ModelDescriptor>(
  models: T[],
  preferred: string
): T {
  if (models.length === 0) {
    throw new Error('No Copilot models available. Please ensure GitHub Copilot is installed and signed in.');
  }

  const preferredNormalized = normalize(preferred);
  if (!preferredNormalized) {
    return models[0];
  }

  const exactIdMatch = models.find((model) => normalize(model.id) === preferredNormalized);
  if (exactIdMatch) {
    return exactIdMatch;
  }

  const exactNameMatch = models.find((model) => normalize(model.name) === preferredNormalized);
  if (exactNameMatch) {
    return exactNameMatch;
  }

  const exactFamilyOrVersionMatch = models.find((model) => {
    const values = [model.family, model.version].map(normalize);
    return values.includes(preferredNormalized);
  });
  if (exactFamilyOrVersionMatch) {
    return exactFamilyOrVersionMatch;
  }

  const partialMatch = models.find((model) => includesAnyField(model, preferredNormalized));
  return partialMatch ?? models[0];
}
