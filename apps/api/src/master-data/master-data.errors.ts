export class MasterDataNotFoundError extends Error {
  readonly code = 'MASTER_DATA_NOT_FOUND';

  constructor(entity: string) {
    super(`${entity} was not found`);
    this.name = 'MasterDataNotFoundError';
  }
}

export class MasterDataSiteMismatchError extends Error {
  readonly code = 'MASTER_DATA_SITE_MISMATCH';

  constructor() {
    super('Related master-data records must belong to the same site');
    this.name = 'MasterDataSiteMismatchError';
  }
}

export class MasterDataVersionConflictError extends Error {
  readonly code = 'MASTER_DATA_VERSION_CONFLICT';

  constructor() {
    super('Master data changed after it was loaded');
    this.name = 'MasterDataVersionConflictError';
  }
}

export class MasterDataInactiveSiteError extends Error {
  readonly code = 'MASTER_DATA_INACTIVE_SITE';

  constructor() {
    super('New master data cannot be assigned to an inactive site');
    this.name = 'MasterDataInactiveSiteError';
  }
}
