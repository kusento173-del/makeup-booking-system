export function requiredMasterDataText(value: string, field: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new TypeError(`${field} must not be blank`);
  }

  return normalized;
}

export function optionalMasterDataText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
